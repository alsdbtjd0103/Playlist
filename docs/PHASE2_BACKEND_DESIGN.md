# 플리로그 Phase 2 — 백엔드 설계서 (친구 방 + 피드)

> 작성: 2026-06-23 · 기준 로드맵: [`SOCIAL_FEATURES_ROADMAP.md`](SOCIAL_FEATURES_ROADMAP.md) Phase 2 (기능 B / B-1)
> 상태: **설계 확정본.** 친구 방 + 피드 + 댓글까지. 릴레이(B-2)는 Phase 3 별도.

---

## 0. 아키텍처 한눈에

```
┌──────────────┐   인증/메타(JSON, 작음)   ┌─────────────────────────┐
│   RN 앱       │ ───────────────────────▶ │  Supabase (관리형, 무카드) │
│ (Expo dev     │   소셜로그인·방·게시물·댓글  │  - Auth (Google/Apple/Kakao)│
│  build)       │ ◀─────────────────────── │  - Postgres + RLS          │
│              │                          │  - Edge Functions (presign)│
│  로컬 우선    │                          └─────────────────────────┘
│  + 캐시       │        presigned PUT/GET (오디오 바이트, 큼)
│              │ ◀──────────────────────────────────┐
└──────────────┘                                     │
        │ 직접 업/다운로드 (Supabase 안 거침)          ▼
        └────────────────────────────────▶ ┌─────────────────────────┐
                                           │  Oracle VM + MinIO       │
                                           │  - S3 호환 오디오 저장    │
                                           │  - ILM: 7일 후 자동 삭제  │
                                           │  - Caddy(HTTPS) 앞단      │
                                           └─────────────────────────┘
```

**원칙**
- **인증 + 데이터는 Supabase에 묶는다** (Auth ↔ RLS 통합이 핵심 가치).
- **무거운 오디오 바이트만 Oracle VM(MinIO)** 으로 분리 → Supabase egress(5GB/월)는 메타데이터만 → 여유.
- 앱은 **로컬 우선**. 클라우드 업로드는 사용자가 "방에 올릴 때"만, **최대 7일** 보관 후 자동 소멸(BeReal식 휘발).
- MinIO는 **S3 호환** → 나중에 Cloudflare R2로 바꿔도 presigned 패턴 동일(엔드포인트/키만 교체).

---

## 1. 인증 (소셜 로그인)

- **Supabase Auth** 사용. 공급자: Google · Apple(iOS 필수) · Kakao(국내).
- RN 연동: `@supabase/supabase-js` + `expo-auth-session`(또는 `expo-web-browser`)로 OAuth 리다이렉트.
  - 리다이렉트 스킴: 기존 dev/preview 스킴 재사용 (`plilog.dev://` 등, [[dev-build-variant-setup]] 참고).
- 로그인 성공 → `auth.users`에 행 생성 → 트리거로 `profiles` 미러링(아래).
- **익명 사용도 허용**: 소셜 기능을 안 쓰는 사용자는 로그인 없이 연습실(로컬)만 그대로 사용.

---

## 2. 데이터 모델 (Supabase Postgres)

> DB는 snake_case, 앱 타입은 camelCase. `lib/social.ts`에서 매핑(아래 8절).
> 오디오 **바이트는 DB에 없음** — `object_key`(MinIO 경로)만 저장.

### 2.1 DDL

```sql
-- 사용자 프로필 (auth.users 미러)
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- 방
create table rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references profiles(id) on delete cascade,
  invite_code text not null unique,         -- 초대 코드(공유용)
  created_at  timestamptz not null default now()
);

-- 멤버십 (방 ↔ 사용자)
create table memberships (
  room_id   uuid references rooms(id) on delete cascade,
  user_id   uuid references profiles(id) on delete cascade,
  role      text not null default 'member', -- 'owner' | 'member'
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- 게시물 (방 피드에 올린 녹음)
create table posts (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  author_id   uuid not null references profiles(id) on delete cascade,
  object_key  text not null,                -- MinIO 경로: rooms/{room_id}/{uuid}.m4a
  title       text,                          -- 곡 제목(iTunes 메타)
  artist      text,
  artwork_url text,
  caption     text,
  duration    real,                          -- 초
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days'  -- 7일 휘발
);
create index on posts (room_id, created_at desc);

-- 댓글
create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  text       text not null,
  created_at timestamptz not null default now()
);
create index on comments (post_id, created_at);

-- 리액션 (ㅋㅋ, 박수, 하트 …)
create table reactions (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
```

### 2.2 profiles 자동 생성 트리거

```sql
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '플리로그 사용자'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

---

## 3. RLS (행 수준 보안) — 보안의 핵심

> 원칙: **내가 멤버인 방의 데이터만** 보이고 쓸 수 있다.
> ⚠️ memberships 정책에서 memberships를 다시 조회하면 **무한 재귀** → `security definer` 헬퍼로 우회.

```sql
-- 모든 테이블 RLS 켜기
alter table profiles    enable row level security;
alter table rooms       enable row level security;
alter table memberships enable row level security;
alter table posts       enable row level security;
alter table comments    enable row level security;
alter table reactions   enable row level security;

-- 멤버 여부 헬퍼 (재귀 회피)
create function is_member(p_room uuid, p_user uuid) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.memberships
    where room_id = p_room and user_id = p_user
  );
$$;

-- profiles: 본인 + (같은 방 멤버는 읽기)
create policy "profiles self write" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles read" on profiles
  for select using (true);   -- 표시용 이름/아바타는 공개로 충분

-- rooms: 멤버만 조회 / 누구나 생성(생성자=owner)
create policy "rooms read"   on rooms for select using (is_member(id, auth.uid()));
create policy "rooms insert" on rooms for insert with check (owner_id = auth.uid());
create policy "rooms owner update" on rooms for update using (owner_id = auth.uid());

-- memberships: 내 멤버십은 조회/탈퇴 가능. 가입은 Edge Function(초대코드 검증) 경유.
create policy "memberships read self" on memberships
  for select using (user_id = auth.uid() or is_member(room_id, auth.uid()));
create policy "memberships leave" on memberships
  for delete using (user_id = auth.uid());

-- posts: 멤버만 조회, 본인만 작성/삭제
create policy "posts read"   on posts for select using (is_member(room_id, auth.uid()));
create policy "posts insert" on posts for insert
  with check (author_id = auth.uid() and is_member(room_id, auth.uid()));
create policy "posts delete" on posts for delete using (author_id = auth.uid());

-- comments / reactions: 해당 게시물 방의 멤버만
create policy "comments read" on comments for select
  using (is_member((select room_id from posts where id = post_id), auth.uid()));
create policy "comments insert" on comments for insert
  with check (author_id = auth.uid()
    and is_member((select room_id from posts where id = post_id), auth.uid()));
create policy "comments delete" on comments for delete using (author_id = auth.uid());

create policy "reactions read" on reactions for select
  using (is_member((select room_id from posts where id = post_id), auth.uid()));
create policy "reactions write" on reactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and is_member((select room_id from posts where id = post_id), auth.uid()));
```

**방 가입(초대코드)** 은 RLS만으론 안전하게 못 막으므로 **Edge Function `join-room`** 으로 처리(4절).

---

## 4. Edge Functions (presign + 가입)

> Deno 런타임. MinIO 키는 **함수 secret에만** 보관(`supabase secrets set`). 클라이언트엔 절대 노출 X.
> S3 presign은 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 사용, 엔드포인트를 MinIO로.

공통 env: `S3_ENDPOINT=https://storage.plilog.app`, `S3_REGION=us-east-1`(MinIO 임의), `S3_BUCKET=recordings`, `S3_KEY`, `S3_SECRET`.

### 4.1 `sign-upload` — 업로드용 presigned PUT

입력 `{ room_id }` → JWT에서 uid 추출 → `is_member` 확인 → object_key 생성 → presigned PUT(만료 5분) 반환.

```ts
// supabase/functions/sign-upload/index.ts (요지)
const { room_id } = await req.json();
const uid = await getUid(req);                 // JWT 검증
await assertMember(supabase, room_id, uid);    // 아니면 403
const objectKey = `rooms/${room_id}/${crypto.randomUUID()}.m4a`;
const url = await getSignedUrl(s3, new PutObjectCommand({
  Bucket: BUCKET, Key: objectKey, ContentType: "audio/mp4",
}), { expiresIn: 300 });
return json({ uploadUrl: url, objectKey });
```

→ 앱: 이 URL로 **MinIO에 직접 PUT** → 성공하면 `posts` 행 INSERT(`object_key=objectKey`, RLS가 author/멤버 검증).

### 4.2 `sign-download` — 재생용 presigned GET

입력 `{ post_id }` → 그 post의 room 멤버인지 확인 → presigned GET(만료 5분) 반환.

```ts
const { post_id } = await req.json();
const uid = await getUid(req);
const post = await getPostWithRoom(supabase, post_id);  // room_id, object_key, expires_at
if (new Date(post.expires_at) < new Date()) return json({ error: "expired" }, 410);
await assertMember(supabase, post.room_id, uid);
const url = await getSignedUrl(s3, new GetObjectCommand({
  Bucket: BUCKET, Key: post.object_key,
}), { expiresIn: 300 });
return json({ downloadUrl: url });
```

### 4.3 `join-room` — 초대코드로 가입

입력 `{ invite_code }` → 방 찾기 → `memberships`에 `(room_id, uid)` upsert(service role) → 방 정보 반환.

---

## 5. 오디오 저장 & 7일 휘발

### 5.1 MinIO 버킷 + 수명주기(ILM)

```bash
mc mb local/recordings
# 7일 지난 객체 자동 삭제 (네이티브, cron 불필요)
mc ilm add local/recordings --expiry-days 7
```

### 5.2 DB 행 정리 (pg_cron)

```sql
select cron.schedule('purge-expired-posts', '0 4 * * *', $$
  delete from posts where expires_at < now();
$$);
```

→ **오디오 바이트(MinIO ILM)와 post 행(pg_cron)이 7일에 함께 소멸.** 둘 다 자동.

---

## 6. Oracle VM 1회 셋업 체크리스트

1. **VM 생성** — Ampere A1(2 OCPU/12GB) 또는 AMD Micro. 리전은 용량 잘 잡히는 곳(프랑크푸르트/싱가포르).
2. **네트워크 개방(오라클 단골 함정)** — Security List **와** VM 내부 firewall(iptables/firewalld) **둘 다** 443 허용.
3. **도메인** — `storage.plilog.app` A레코드 → VM 공인 IP.
4. **MinIO 설치** — docker 또는 바이너리. 데이터 디렉터리는 200GB 블록볼륨.
5. **Caddy 리버스 프록시** — `storage.plilog.app` → MinIO, Let's Encrypt 자동 TLS.
6. **서비스 계정 키** — Edge Function 전용 access key/secret 발급 → `supabase secrets set`.
7. **버킷 + ILM** — 5.1 적용.

> 운영 부담(보안패치·백업·모니터링)은 본인 몫. 신뢰성이 더 중요해지면 MinIO → **Cloudflare R2**로 교체(코드 동일, egress 0).

---

## 7. 클라이언트 흐름 (앱)

### 업로드 (방에 올리기)
```
로컬 녹음 보유 → [방에 올리기] 탭
 → sign-upload(room_id) 호출 → { uploadUrl, objectKey }
 → uploadUrl로 MinIO에 PUT (파일 바이트)
 → posts INSERT { room_id, object_key, title, artist, artwork_url, caption, duration }
```

### 피드 조회 / 재생
```
방 진입 → posts SELECT (RLS: 멤버만, created_at desc) → 카드 렌더(앨범아트)
 재생 → 로컬 캐시 확인
   ├ 있으면 → 즉시 재생 (네트워크 0)
   └ 없으면 → sign-download(post_id) → downloadUrl로 MinIO GET → 로컬 캐시 저장 → 재생
```

- **로컬 캐시 키 = object_key.** 한 번 받으면 재다운로드 0 → VM egress·요청 급감.
- 재생은 기존 `contexts/PlayerContext`(react-native-track-player) 재사용. 캐시된 `file://` 경로를 트랙 소스로.

---

## 8. 앱 타입 & 모듈 (기존 컨벤션 유지)

`types/index.ts`에 추가:
```typescript
export interface RoomT { id: string; name: string; ownerId: string; inviteCode: string; createdAt: Date; }
export interface PostT {
  id: string; roomId: string; authorId: string; objectKey: string;
  title?: string; artist?: string; artworkUrl?: string; caption?: string;
  duration?: number; createdAt: Date; expiresAt: Date;
}
export interface CommentT { id: string; postId: string; authorId: string; text: string; createdAt: Date; }
export interface ReactionT { postId: string; userId: string; emoji: string; }
```

신규 모듈(기존 `lib/database.ts` 패턴 = 얇은 CRUD 래퍼):
- `lib/supabase.ts` — 클라이언트 초기화(AsyncStorage 세션 저장).
- `lib/auth.ts` — 소셜 로그인/로그아웃/세션.
- `lib/social.ts` — rooms/posts/comments/reactions CRUD (snake↔camel 매핑) + sign-upload/sign-download 호출 + 로컬 캐시.

신규 화면: `RoomsScreen`(방 목록/생성/가입) · `RoomFeedScreen`(피드+댓글). Navigation 타입에 추가.

---

## 9. 단계별 작업 순서 (구현 시)

1. Supabase 프로젝트 + 스키마/RLS/트리거 적용 (2·3절).
2. 소셜 로그인 1종(구글)부터 RN 연동 (`lib/supabase.ts`, `lib/auth.ts`).
3. Oracle VM + MinIO + Caddy 셋업 (6절).
4. Edge Functions 3종 배포 (4절).
5. `lib/social.ts` + 방/피드 화면 (7·8절).
6. 댓글/리액션 → 7일 휘발/캐시 마무리.
7. (선택) Realtime 구독으로 피드/댓글 실시간 갱신.

---

## 10. 미결/주의

- **Apple 로그인**: iOS 앱스토어 심사상 소셜로그인 제공 시 Apple 로그인 **필수**.
- **모더레이션**: 친구 방이라도 최소 신고/차단/방 나가기 필요(로드맵 8절).
- **MinIO 단일 VM = SPOF**: 무료 단계엔 감수. 중요해지면 R2 이전.
- **무료 프로젝트 일시정지**: Supabase는 1주 무활동 시 일시정지(다음 요청 시 깨어남). Oracle은 무료 계정 회수 리스크 → 백업 스냅샷 권장.
- **R2 전환 경로 확보**: `lib/social.ts`의 sign-* 호출부만 그대로 두고 Edge Function의 S3 엔드포인트/키만 R2로 바꾸면 끝.
</content>
</invoke>
