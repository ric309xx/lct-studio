import {useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CircleHelp} from 'lucide-react';
import './helpHint.css';

/** Hover/focus for a quick explanation; click to pin on touch devices. Portal
 * out of the scrolling sidebar so the help text is never clipped by it. */
export function HelpHint({label,children}:{label:string;children:ReactNode}){
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),bubble=useRef<HTMLDivElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),pinned=useRef(false),focused=useRef(false);
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:12,top:12});
  const cancelClose=()=>{if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}};
  const close=()=>{cancelClose();pinned.current=false;setOpen(false);};
  const show=()=>{cancelClose();setOpen(true);};
  const scheduleClose=()=>{cancelClose();timer.current=setTimeout(()=>{if(!pinned.current&&!focused.current)setOpen(false);},150);};
  useEffect(()=>()=>{if(timer.current!==null)clearTimeout(timer.current);},[]);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const anchor=trigger.current?.getBoundingClientRect(),panel=bubble.current?.getBoundingClientRect();if(!anchor||!panel)return;
      const maxLeft=Math.max(12,window.innerWidth-panel.width-12);
      let left=anchor.right+10,top=anchor.top;
      if(left>maxLeft){left=Math.min(maxLeft,Math.max(12,anchor.left));top=anchor.bottom+8;}
      if(top+panel.height>window.innerHeight-12)top=Math.max(12,Math.min(anchor.top-panel.height-8,window.innerHeight-panel.height-12));
      setPosition({left:Math.min(maxLeft,left),top:Math.max(12,top)});
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    const dismiss=(event:PointerEvent)=>{if(!trigger.current?.contains(event.target as Node)&&!bubble.current?.contains(event.target as Node))close();};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[open,children]);
  return <>
    <button ref={trigger} type="button" className="help-hint-trigger" aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open?id:undefined}
      onMouseEnter={show} onMouseLeave={scheduleClose} onFocus={()=>{focused.current=true;show();}} onBlur={()=>{focused.current=false;scheduleClose();}}
      onClick={()=>{cancelClose();if(pinned.current)close();else{pinned.current=true;setOpen(true);}}}>
      <CircleHelp size={16} aria-hidden="true"/>
    </button>
    {open&&createPortal(<div ref={bubble} id={id} role="tooltip" className="help-hint-bubble" style={position} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>{children}</div>,document.body)}
  </>;
}
