import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {HeightReferenceStatus} from './HeightReferenceStatus';
afterEach(cleanup);
it('labels public values as orthometric while keeping render-frame details out of editing controls',()=>{
  render(<HeightReferenceStatus resolution={{profileId:'1006',revision:'test',sourceDatum:'TWVD2001',status:'converted-local-controls',undulationM:19.65,appliedOffsetM:19.65,reason:'local'}}/>);
  expect(screen.getByText('高程：TWVD2001 正高')).toBeVisible();
  expect(screen.queryByText(/對外高程維持正高/)).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole('button',{name:'高程基準說明'}));
  expect(screen.getByRole('tooltip')).toHaveTextContent('原始資料／成果：TWVD2001 正高');
  expect(screen.getByRole('tooltip')).toHaveTextContent('對外高程維持正高');expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
});
it('keeps pending conversion warnings visible without opening the help bubble',()=>{
  render(<HeightReferenceStatus resolution={{profileId:'test',revision:'test',sourceDatum:'TWVD2001',status:'pending',undulationM:null,appliedOffsetM:0,reason:'來源版本待確認'}}/>);
  expect(screen.getByText(/換算待確認/)).toBeVisible();expect(screen.getByRole('status')).toHaveTextContent('來源版本待確認');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('shows missing verification, not an apparently valid zero offset or orthometric result',()=>{
  render(<HeightReferenceStatus resolution={{profileId:'unknown',revision:'test',sourceDatum:'unknown',status:'pending',undulationM:null,appliedOffsetM:0,reason:'缺少設定'}}/>);
  expect(screen.getByRole('status')).toHaveTextContent('缺少設定');expect(screen.queryByText(/內部定位已換算/)).not.toBeInTheDocument();
});
