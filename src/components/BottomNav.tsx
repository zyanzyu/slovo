import { NavLink } from 'react-router-dom';
import { House, LibraryBig, Settings2, Upload } from 'lucide-react';

const items = [
  { to: '/', label: '今天', icon: House, end: true },
  { to: '/library', label: '词库', icon: LibraryBig, end: false },
  { to: '/import', label: '导入', icon: Upload, end: false },
  { to: '/settings', label: '设置', icon: Settings2, end: false },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      <div className="nav-inner">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
