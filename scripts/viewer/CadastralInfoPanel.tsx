import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import "./cadastralInfoPanel.css";

export function CadastralInfoPanel({ parcelNo, onClose, children }: {
  parcelNo: string; onClose: () => void; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return <>
    <aside id="cadastral-info-panel" className="landmark-card cadastral-card" aria-label="地籍資訊" hidden={collapsed}>
      <div className="cadastral-panel-actions">
        <button type="button" aria-label="將地籍資訊收合到右側" title="收合到右側"
          aria-controls="cadastral-info-panel" aria-expanded={!collapsed} onClick={() => setCollapsed(true)}>
          <ChevronRight size={20} />
        </button>
        <button type="button" aria-label="關閉地籍資訊" title="關閉" onClick={onClose}><X size={20} /></button>
      </div>
      {children}
    </aside>
    {collapsed && <button type="button" className="cadastral-restore-tab" aria-label={`展開地籍資訊，地號 ${parcelNo}`}
      aria-controls="cadastral-info-panel" aria-expanded={false} onClick={() => setCollapsed(false)}>
      <ChevronLeft size={20} /><span>地籍資訊</span><small>{parcelNo}</small>
    </button>}
  </>;
}
