import {fireEvent,render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {CaseOverviewMap} from './CaseOverviewMap';
import {buildCaseOverview} from './caseOverview';
import type {CaseMapNavigation} from './caseNavigation';
import parcels from './taoyuan1006Parcels.json';

// UI navigation does not need WebGL. Map initialization safely exposes fallback search.
vi.mock('./config',()=>({parseConfig:()=>{throw Error('test renderer unavailable');}}));
afterEach(cleanup);
const cases=buildCaseOverview(parcels);
describe('case map previous layer',()=>{
  it('shows only the concise model preparation message during entry',()=>{
    const onCancelEntry=vi.fn();
    const props={cases,savedNavigation:{current:null},savedView:{current:null},onEnter:vi.fn(),onCancelEntry};
    const result=render(<CaseOverviewMap {...props} entryPhase="loading"/>);
    expect(screen.getByRole('status')).toHaveTextContent('正在準備現地模型');
    expect(screen.queryByText('保留案件位置，模型就緒後平順切換')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'取消進入'}));
    expect(onCancelEntry).toHaveBeenCalledOnce();
    result.rerender(<CaseOverviewMap {...props} entryPhase="revealing"/>);
    expect(screen.getByRole('status',{hidden:true})).toHaveTextContent('正在準備現地模型');
    expect(screen.queryByRole('button',{name:'取消進入'})).not.toBeInTheDocument();
  });
  it('restores nearby cases and keeps them while selecting another case or entering 3D',()=>{
    const savedNavigation:{current:CaseMapNavigation|null}={current:{selected:cases[0].key,query:'',nearbyKeys:cases.slice(0,3).map(item=>item.key),expandedKeys:cases.slice(0,3).map(item=>item.key)}};
    const onEnter=vi.fn();
    const props={cases,savedNavigation,savedView:{current:null},onEnter};
    const result=render(<CaseOverviewMap {...props}/>);
    expect(screen.getByRole('heading',{name:'這個位置附近的案件'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:cases[1].title}));
    expect(savedNavigation.current?.nearbyKeys).toHaveLength(3);
    expect(savedNavigation.current?.expandedKeys).toHaveLength(3);
    expect(savedNavigation.current?.selected).toBe(cases[1].key);
    fireEvent.click(screen.getByRole('button',{name:'進入 3D 現地檢視'}));
    expect(onEnter).toHaveBeenCalledWith(cases[1].parcels[0].key,expect.objectContaining({view:null,reducedMotion:expect.any(Boolean)}));
    result.unmount();
    render(<CaseOverviewMap {...props}/>);
    expect(screen.getByRole('heading',{name:cases[1].title})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'這個位置附近的案件'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'全部案件'}));
    expect(savedNavigation.current).toEqual({selected:'',query:'',nearbyKeys:[]});
  });
  it('retains search text across the 3D round trip',()=>{
    const savedNavigation:{current:CaseMapNavigation|null}={current:{selected:cases[0].key,query:cases[0].parcels[0].info.parcelNo,nearbyKeys:[]}};
    render(<CaseOverviewMap cases={cases} savedNavigation={savedNavigation} savedView={{current:null}} onEnter={()=>{}}/>);
    expect(screen.getByRole('textbox',{name:'搜尋案件地段或地號'})).toHaveValue(savedNavigation.current!.query);
  });
});
