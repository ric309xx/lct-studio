import type {HeightResolution} from './heightReference';
import {HelpHint} from './HelpHint';
export function HeightReferenceStatus({resolution}:{resolution:HeightResolution}){
  const ready=resolution.status!=='pending';
  const grid=resolution.status==='converted-geoid-grid'||resolution.method==='geoid-grid';
  return <section className="height-reference-compact" aria-label="高程基準">
    <span>{resolution.sourceDatum==='TWVD2001'?`高程：TWVD2001 正高${ready?'':' · 換算待確認'}`:'高程基準待確認'}</span>
    <HelpHint label="高程基準說明">
      <p>{resolution.sourceDatum==='TWVD2001'?'原始資料／成果：TWVD2001 正高':'原始資料高程基準待確認'}</p>
      <p>{ready?`${resolution.status==='already-ellipsoidal'?'來源模型已有橢球高定位，未再加高':'內部定位已換算'}；對外高程維持正高（${grid?'TWGEOID2018h 本區網格換算':'本區控制點換算'}）`:'高程換算待確認；不把未驗證高度標為正高'}</p>
      <p>背景地形僅供定位，不作高程校正依據。</p>
      {grid&&<p>換算來源：<a href="https://doi.org/10.5880/isg.2018.002" target="_blank" rel="noreferrer">TWGEOID18h，Hwang 等（2018）</a>，CC BY 4.0；本區固定值內插。</p>}
    </HelpHint>
    {!ready&&<p className="cadastral-disclaimer" role="status">{resolution.reason}</p>}
  </section>;
}
