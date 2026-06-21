import React from 'react';
import { render } from '@testing-library/react-native';
import { AlbumArt } from '../components/AlbumArt';

describe('AlbumArt', () => {
  it('uri 없으면 음표 아이콘 폴백을 보여준다', () => {
    const { getByTestId } = render(<AlbumArt size={48} />);
    expect(getByTestId('icon-musical-notes')).toBeTruthy();
  });

  it('uri 있으면 Image(testID=album-art-image)를 렌더한다', () => {
    const { getByTestId, queryByTestId } = render(<AlbumArt size={48} uri="http://a/100.jpg" />);
    expect(getByTestId('album-art-image')).toBeTruthy();
    expect(queryByTestId('icon-musical-notes')).toBeNull();
  });
});
