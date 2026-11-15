import { SlidersHorizontal } from 'lucide-react';
import CustomSelect from './CustomSelect';
import './FilterSelect.css';

export default function FilterSelect({ label, options, value, onChange }) {
  return <div className="qf-filter">
    <SlidersHorizontal size={15} aria-hidden="true" />
    <span className="qf-filter-label">{label}</span>
    <CustomSelect className="qf-filter-select" dropdownClassName="qf-filter-options"
      size="sm" ariaLabel={label} value={value} options={options} onChange={onChange} portal />
  </div>;
}
