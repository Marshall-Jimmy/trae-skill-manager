import { motion } from 'motion/react';

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** 自定义勾选框：替换原生 input[type=checkbox]，保持项目深色 + 绿色强调的设计语言。 */
export function Checkbox({
  checked,
  onChange,
  size = 'md',
  disabled,
  className,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  const box = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const check = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      whileTap={{ scale: 0.82 }}
      className={`${box} shrink-0 rounded-[4px] border flex items-center justify-center transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-trae-accent/30 ${
        checked
          ? 'bg-trae-accent border-trae-accent text-trae-bg'
          : 'bg-trae-bg border-trae-border-hover hover:border-trae-accent/60 hover:bg-trae-card/60'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className || ''}`}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={check}
        initial={false}
        animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 28 }}
      >
        <polyline points="20 6 9 17 4 12" />
      </motion.svg>
    </motion.button>
  );
}
