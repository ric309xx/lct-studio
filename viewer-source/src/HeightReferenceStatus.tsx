import type {HeightResolution} from './heightReference';
import {HelpHint} from './HelpHint';
export function HeightReferenceStatus({resolution}:{resolution:HeightResolution}){
  const ready=resolution.status!=='pending';
  return <section className="height-reference-compact" aria-label="高程基準">
    <span>{resolution.sourceDatum==='TWVD2001'?`高程：TWVD2001 正高${ready?'':' · 換算待確認'}`:'高程基準待確認'}</span>
    <HelpHint label="高程基準說明">
      <p>{resolution.sourceDatum==='TWVD2001'?'原始資料／成果：TWVD2001 正高':'原始資料高程基準待確認'}</p>
      <p>{ready?'內部定位已換算；對外高程維持正高（本區控制點換算）':'高程換算待確認；不把未驗證高度標為正高'}</p>
      <p>背景地形僅供定位，不作高程校正依據。</p>
    </HelpHint>
    {!ready&&<p className="cadastral-disclaimer" role="status">{resolution.reason}</p>}
  </section>;
}
