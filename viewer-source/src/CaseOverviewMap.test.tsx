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
    expect(onEnter).toHaveBeenCalledWith(cases[1].parcels[0].key);
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
