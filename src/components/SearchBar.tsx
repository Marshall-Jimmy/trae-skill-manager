import { Search, X, Clock, TrendingUp, XCircle } from 'lucide-react';
import { useState, useCallback, useRef, useEffect, forwardRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSkillStore } from '../store/skillStore';
import type { RemoteSkill } from '../types';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
}

type DropdownItem =
  | { type: 'history'; value: string }
  | { type: 'hot'; value: string }
  | { type: 'suggestion'; skill: RemoteSkill };

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ onSearch, placeholder = '搜索 Skill...' }, ref) => {
    const {
      searchHistory,
      addSearchHistory,
      removeSearchHistory,
      clearSearchHistory,
      getSearchSuggestions,
      getHotSearches,
    } = useSkillStore();

    const [value, setValue] = useState('');
    const [focused, setFocused] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const timerRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Combine refs (forwarded + local)
    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }
      },
      [ref],
    );

    // Compute dropdown items based on current value
    const dropdownItems = useMemo<DropdownItem[]>(() => {
      const trimmed = value.trim();
      if (!trimmed) {
        // Empty input: show history + hot searches
        const items: DropdownItem[] = [];
        for (const h of searchHistory) {
          items.push({ type: 'history', value: h });
        }
        const hotSearches = getHotSearches();
        const historySet = new Set(searchHistory.map((s) => s.toLowerCase()));
        for (const h of hotSearches) {
          if (!historySet.has(h.toLowerCase())) {
            items.push({ type: 'hot', value: h });
          }
        }
        return items;
      } else {
        // Has input: show suggestions
        const suggestions = getSearchSuggestions(trimmed);
        return suggestions.map((skill) => ({ type: 'suggestion' as const, skill }));
      }
    }, [value, searchHistory, getSearchSuggestions, getHotSearches]);

    // Section headers for empty state (history + hot)
    const hasHistory = value.trim() === '' && searchHistory.length > 0;
    const hasHot = value.trim() === ''; // Always show hot searches when empty

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        setActiveIndex(-1);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          if (newValue.trim()) {
            onSearch(newValue);
          }
        }, 300);
      },
      [onSearch],
    );

    const handleClear = useCallback(() => {
      setValue('');
      setActiveIndex(-1);
      onSearch('');
      inputRef.current?.focus();
    }, [onSearch]);

    const triggerSearch = useCallback(
      (query: string) => {
        setValue(query);
        setShowDropdown(false);
        setActiveIndex(-1);
        addSearchHistory(query);
        onSearch(query);
      },
      [addSearchHistory, onSearch],
    );

    const handleItemClick = useCallback(
      (item: DropdownItem) => {
        if (item.type === 'suggestion') {
          triggerSearch(item.skill.name);
        } else {
          triggerSearch(item.value);
        }
      },
      [triggerSearch],
    );

    const handleRemoveHistory = useCallback(
      (e: React.MouseEvent, query: string) => {
        e.stopPropagation();
        removeSearchHistory(query);
      },
      [removeSearchHistory],
    );

    const handleClearHistory = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        clearSearchHistory();
      },
      [clearSearchHistory],
    );

    // Keyboard navigation
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown || dropdownItems.length === 0) {
          if (e.key === 'Enter' && value.trim()) {
            addSearchHistory(value.trim());
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((prev) => (prev < dropdownItems.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : dropdownItems.length - 1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < dropdownItems.length) {
            handleItemClick(dropdownItems[activeIndex]);
          } else if (value.trim()) {
            addSearchHistory(value.trim());
            setShowDropdown(false);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowDropdown(false);
          setActiveIndex(-1);
        }
      },
      [showDropdown, dropdownItems, activeIndex, value, handleItemClick, addSearchHistory],
    );

    // Click outside to close dropdown
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setShowDropdown(false);
          setActiveIndex(-1);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show dropdown when focused
    const handleFocus = useCallback(() => {
      setFocused(true);
      setShowDropdown(true);
    }, []);

    const handleBlur = useCallback(() => {
      setFocused(false);
      // Slight delay to allow click events on dropdown items to fire
      setTimeout(() => {
        setShowDropdown(false);
        setActiveIndex(-1);
      }, 120);
    }, []);

    // Ctrl+K / Cmd+K global shortcut to focus search
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable)
        ) {
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
      return () => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
      };
    }, []);

    // Highlight matching text
    const highlightText = useCallback((text: string, query: string) => {
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const idx = lowerText.indexOf(lowerQuery);
      if (idx === -1) return text;
      return (
        <>
          {text.slice(0, idx)}
          <span className="bg-trae-accent/20 text-trae-accent font-medium">
            {text.slice(idx, idx + query.length)}
          </span>
          {text.slice(idx + query.length)}
        </>
      );
    }, []);

    // Compute the position of history section for index tracking
    const historyCount = hasHistory ? searchHistory.length : 0;

    return (
      <div ref={containerRef} className="relative">
        <motion.div
          animate={{
            scale: focused ? 1.005 : 1,
          }}
          transition={{ type: 'spring' as const, stiffness: 400, damping: 25 }}
        >
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
            <Search className={`w-4 h-4 transition-colors duration-200 ${focused ? 'text-trae-accent' : 'text-trae-text-secondary'}`} />
          </div>
          <input
            ref={setRefs}
            type="text"
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label="搜索 Skill"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            className="w-full bg-trae-card/50 border border-trae-border rounded-xl pl-10 pr-20 py-2.5 text-sm text-trae-text placeholder-trae-text-secondary/50 focus:outline-none focus:border-trae-accent/50 focus:ring-1 focus:ring-trae-accent/20 transition-all"
          />
          {/* Ctrl+K shortcut badge */}
          <AnimatePresence>
            {!value && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-0.5 pointer-events-none"
              >
                <kbd className="px-1.5 py-0.5 rounded-md text-[10px] font-mono text-trae-text-secondary/60 bg-trae-card/60 border border-trae-border">
                  {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+K
                </kbd>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {value && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.85 }}
                onClick={handleClear}
                aria-label="清除搜索"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-trae-card/60 transition-colors"
              >
                <X className="w-4 h-4 text-trae-text-secondary hover:text-trae-text" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Dropdown panel */}
        <AnimatePresence>
          {showDropdown && dropdownItems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ type: 'spring', mass: 1, stiffness: 400, damping: 28 }}
              className="absolute top-full left-0 right-0 mt-1.5 bg-trae-sidebar border border-trae-border rounded-xl shadow-hard z-50 py-2 overflow-hidden max-h-[400px] overflow-y-auto"
              role="listbox"
            >
              {/* Search History Section */}
              {hasHistory && (
                <>
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[11px] font-medium text-trae-text-secondary/70 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      搜索历史
                    </span>
                    <button
                      onClick={handleClearHistory}
                      className="text-[11px] text-trae-text-secondary hover:text-trae-danger transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-3 h-3" />
                      清空历史
                    </button>
                  </div>
                  {searchHistory.map((item, i) => (
                    <motion.div
                      key={`history-${item}`}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02, type: 'spring', mass: 1, stiffness: 400, damping: 28 }}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleItemClick({ type: 'history', value: item });
                      }}
                      className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors group ${
                        activeIndex === i
                          ? 'bg-trae-accent/10 text-trae-accent'
                          : 'hover:bg-trae-card/40 text-trae-text'
                      }`}
                      role="option"
                      aria-selected={activeIndex === i}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Clock className="w-3.5 h-3.5 text-trae-text-secondary/50 shrink-0" />
                        <span className="text-sm truncate">{item}</span>
                      </div>
                      <button
                        onClick={(e) => handleRemoveHistory(e, item)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-trae-card/60 transition-all shrink-0 ml-2"
                        aria-label={`删除历史记录: ${item}`}
                      >
                        <X className="w-3.5 h-3.5 text-trae-text-secondary hover:text-trae-text" />
                      </button>
                    </motion.div>
                  ))}
                  {hasHot && (
                    <div className="mx-3 my-1.5 h-px bg-trae-border/60" />
                  )}
                </>
              )}

              {/* Hot Searches Section */}
              {hasHot && (
                <>
                  <div className="px-3 py-1.5">
                    <span className="text-[11px] font-medium text-trae-text-secondary/70 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" />
                      热门搜索
                    </span>
                  </div>
                  {getHotSearches()
                    .filter((h) => !new Set(searchHistory.map((s) => s.toLowerCase())).has(h.toLowerCase()))
                    .map((item, i) => (
                      <motion.div
                        key={`hot-${item}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (historyCount + i) * 0.02, type: 'spring', mass: 1, stiffness: 400, damping: 28 }}
                        onMouseEnter={() => setActiveIndex(historyCount + i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleItemClick({ type: 'hot', value: item });
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                          activeIndex === historyCount + i
                            ? 'bg-trae-accent/10 text-trae-accent'
                            : 'hover:bg-trae-card/40 text-trae-text'
                        }`}
                        role="option"
                        aria-selected={activeIndex === historyCount + i}
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-trae-accent/50 shrink-0" />
                        <span className="text-sm truncate">{item}</span>
                      </motion.div>
                    ))}
                </>
              )}

              {/* Suggestions Section */}
              {value.trim() && dropdownItems.length > 0 && (
                <>
                  <div className="px-3 py-1.5">
                    <span className="text-[11px] font-medium text-trae-text-secondary/70 uppercase tracking-wider flex items-center gap-1.5">
                      <Search className="w-3 h-3" />
                      搜索建议
                    </span>
                  </div>
                  {dropdownItems.map((item, i) => {
                    if (item.type !== 'suggestion') return null;
                    const skill = item.skill;
                    return (
                      <motion.div
                        key={`suggestion-${skill.id}`}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02, type: 'spring', mass: 1, stiffness: 400, damping: 28 }}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleItemClick(item);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          activeIndex === i
                            ? 'bg-trae-accent/10 text-trae-accent'
                            : 'hover:bg-trae-card/40 text-trae-text'
                        }`}
                        role="option"
                        aria-selected={activeIndex === i}
                      >
                        <Search className="w-3.5 h-3.5 text-trae-text-secondary/50 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {highlightText(skill.name, value.trim())}
                          </div>
                          <div className="text-xs text-trae-text-secondary truncate flex items-center gap-1.5">
                            <span className="truncate">{skill.source}</span>
                            {skill.installs > 0 && (
                              <span className="text-trae-text-secondary/50 shrink-0">
                                · {skill.installs >= 1000 ? `${(skill.installs / 1000).toFixed(1)}K` : skill.installs}
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

SearchBar.displayName = 'SearchBar';
