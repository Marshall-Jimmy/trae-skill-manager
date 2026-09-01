import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, TrendingUp, ExternalLink, Languages, Check, Copy, Star, Heart, Tag, Github, Scale } from 'lucide-react';
import { useSkillStore, getSkillTags } from '../store/skillStore';
import { translateWithGlossary } from '../lib/glossary';
import { Checkbox } from './Checkbox';
import type { RemoteSkill } from '../types';
import { useMotionConfig } from '../lib/motionConfig';

interface SkillCardProps {
  skill: RemoteSkill;
  onInstall: (skill: RemoteSkill) => void;
  installing: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onShowDetail: (skill: RemoteSkill) => void;
  highlightQuery?: string;
  viewMode?: 'grid' | 'list';
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function SkillCard({
  skill,
  onInstall,
  installing,
  selected,
  onSelect,
  onShowDetail,
  highlightQuery,
  viewMode = 'grid',
}: SkillCardProps) {
  const { config, getTranslatedDescription, localSkills, toggleFavorite, isFavorite, toggleTag, selectedTags } = useSkillStore();
  const { getTransition } = useMotionConfig();
  const translatedDesc = skill.description ? getTranslatedDescription(skill.description) : undefined;
  const glossaryTranslated = skill.description ? translateWithGlossary(skill.description) : undefined;
  const glossaryMeaningful = !!glossaryTranslated && glossaryTranslated !== skill.description;
  // LLM 翻译未启用（或无缓存）时回退到本地词库对照展示（B 方案）
  const showTranslation = (config.translation.enabled && translatedDesc) || glossaryMeaningful;
  const displayTranslated = translatedDesc || glossaryTranslated;

  const tags = getSkillTags(skill);
  const isFav = isFavorite(skill.id);
  const [heartAnimating, setHeartAnimating] = useState(false);
  const springMedium = getTransition('medium');
  const springSnappy = getTransition('snappy');

  // Highlight matching text in skill name
  const highlightedName = (() => {
    if (!highlightQuery || !highlightQuery.trim()) return skill.name;
    const query = highlightQuery.trim().toLowerCase();
    const nameLower = skill.name.toLowerCase();
    const idx = nameLower.indexOf(query);
    if (idx === -1) return skill.name;
    return (
      <>
        {skill.name.slice(0, idx)}
        <span className="bg-trae-accent/20 text-trae-accent font-medium rounded px-0.5">
          {skill.name.slice(idx, idx + query.length)}
        </span>
        {skill.name.slice(idx + query.length)}
      </>
    );
  })();

  // Check if skill is installed:
  // 1. First try exact match by manifest ID (most reliable)
  // 2. Fall back to name + path fuzzy match (for legacy installs without manifest)
  const isInstalled = (() => {
    const exactMatch = localSkills.find((ls) => ls.manifestId === skill.id);
    if (exactMatch) return true;

    const normalizedSource = skill.source.replace(/\\/g, '/');
    return localSkills.some(
      (ls) =>
        !ls.manifestId &&
        ls.name === skill.name &&
        ls.path.replace(/\\/g, '/').includes(normalizedSource)
    );
  })();
  const [copied, setCopied] = useState(false);

  const installCommand = `npx skills add ${skill.source}${skill.name !== skill.source.split('/').pop() ? ` --skill ${skill.name}` : ''}`;

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('button[data-install]') ||
      target.closest('button[data-copy]') ||
      target.closest('button[data-favorite]') ||
      target.closest('button[data-tag]') ||
      target.closest('a[data-source]')
    ) {
      return;
    }
    onShowDetail(skill);
  };

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstall(skill);
  };

  const handleCopyClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(skill.id);
    if (!isFav) {
      setHeartAnimating(true);
      setTimeout(() => setHeartAnimating(false), 600);
    }
  };

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    toggleTag(tag);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onShowDetail(skill);
    }
  };

  // Tags display: show max 3, with +N for more
  const visibleTags = tags.slice(0, 3);
  const extraTagsCount = tags.length - 3;

  if (viewMode === 'list') {
    // List view - more compact, single row
    return (
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={`查看 ${skill.name} 详情`}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        whileHover={{ y: -1, transition: springSnappy }}
        whileTap={{ scale: 0.995, transition: springSnappy }}
        className={`bg-trae-card/40 border rounded-lg px-3 py-2.5 hover:bg-trae-card/60 transition-colors group cursor-pointer focus:outline-none focus:ring-2 focus:ring-trae-accent/40 ${
          selected
            ? 'border-trae-accent shadow-[0_0_12px_rgba(0,255,136,0.08)]'
            : 'border-trae-border hover:border-trae-accent/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Checkbox */}
          <div className="shrink-0">
            <Checkbox
              size="sm"
              checked={selected}
              onChange={() => onSelect(skill.id)}
              aria-label={`选择 ${skill.name}`}
            />
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-trae-text font-medium text-sm truncate">
                {highlightedName}
              </h3>
              {isInstalled && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-success/10 text-trae-success shrink-0">
                  <Check className="w-2.5 h-2.5" />
                  已安装
                </span>
              )}
            </div>
          </div>

          {/* Tags (compact) */}
          <div className="hidden sm:flex items-center gap-1 shrink-0 max-w-[200px] overflow-hidden">
            {visibleTags.map((tag) => (
              <button
                key={tag}
                data-tag
                onClick={(e) => handleTagClick(e, tag)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-trae-accent/20 text-trae-accent'
                    : 'bg-trae-card/60 text-trae-text-secondary hover:bg-trae-accent/10 hover:text-trae-accent'
                }`}
              >
                {tag}
              </button>
            ))}
            {extraTagsCount > 0 && (
              <span className="px-1 py-0.5 rounded text-[10px] bg-trae-card/40 text-trae-text-secondary/70">
                +{extraTagsCount}
              </span>
            )}
          </div>

          {/* Source */}
          <div className="hidden md:block shrink-0 w-[140px]">
            <span
              className="text-[11px] text-trae-text-secondary truncate block"
              title={skill.repoDescription || skill.source}
            >
              {skill.source}
            </span>
            {skill.license && (
              <span className="text-[10px] text-trae-text-secondary/60 truncate block">
                {skill.license}
              </span>
            )}
          </div>

          {/* Installs */}
          <div className="hidden sm:flex items-center gap-1 shrink-0 w-[70px] justify-end">
            <TrendingUp className="w-3 h-3 text-trae-text-secondary" />
            <span className="text-[11px] text-trae-text-secondary">
              {skill.installs > 0 ? formatInstalls(skill.installs) : '-'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              data-favorite
              onClick={handleFavoriteClick}
              aria-label={isFav ? '取消收藏' : '收藏'}
              className={`p-1.5 rounded-lg transition-all ${
                isFav
                  ? 'text-trae-accent'
                  : 'text-trae-text-secondary hover:text-trae-accent opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
              title={isFav ? '取消收藏' : '收藏'}
            >
              <motion.div
                animate={heartAnimating ? { scale: [1, 1.4, 1], rotate: [0, -10, 10, -10, 0] } : {}}
                transition={{ duration: 0.6, times: [0, 0.3, 0.6, 0.8, 1] }}
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
              </motion.div>
            </button>
            <button
              data-install
              onClick={handleInstallClick}
              disabled={installing || isInstalled}
              aria-label={isInstalled ? '已安装' : installing ? '安装中' : `安装 ${skill.name}`}
              aria-busy={installing}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                isInstalled
                  ? 'bg-trae-success/10 text-trae-success cursor-default'
                  : installing
                  ? 'bg-trae-accent/20 text-trae-accent cursor-wait'
                  : 'bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 active:bg-trae-accent/30'
              }`}
            >
              <Download
                className={`w-3 h-3 ${installing ? 'animate-pulse' : ''}`}
              />
              {isInstalled ? '已安装' : installing ? '安装中' : '安装'}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Grid view (default card layout)
  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`查看 ${skill.name} 详情`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      whileHover={{ y: -2, transition: springSnappy }}
      whileTap={{ scale: 0.995, transition: springSnappy }}
      className={`bg-trae-card/40 border rounded-xl p-4 hover:bg-trae-card/60 transition-colors group skill-enter cursor-pointer focus:outline-none focus:ring-2 focus:ring-trae-accent/40 h-full overflow-hidden ${
        selected
          ? 'border-trae-accent shadow-[0_0_12px_rgba(0,255,136,0.08)]'
          : 'border-trae-border hover:border-trae-accent/30'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5 shrink-0">
          <Checkbox
            checked={selected}
            onChange={() => onSelect(skill.id)}
            aria-label={`选择 ${skill.name}`}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-trae-text font-medium text-sm truncate">
                  {highlightedName}
                </h3>
                {isInstalled && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-trae-success/10 text-trae-success shrink-0">
                    <Check className="w-2.5 h-2.5" />
                    已安装
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {/* Source link */}
                {skill.source && (
                  <a
                    href={
                      skill.source.startsWith('http')
                        ? skill.source
                        : `https://github.com/${skill.source}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    data-source
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-xs text-trae-text-secondary hover:text-trae-accent transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="truncate max-w-[180px]">{skill.source}</span>
                  </a>
                )}
                {skill.license && (
                  <span className="flex items-center gap-1 text-xs text-trae-text-secondary/60">
                    <Scale className="w-3 h-3" />
                    {skill.license}
                  </span>
                )}
                {skill.installs > 0 && (
                  <span className="flex items-center gap-1 text-xs text-trae-text-secondary">
                    <TrendingUp className="w-3 h-3" />
                    {formatInstalls(skill.installs)} installs
                  </span>
                )}
                {skill.installs === 0 && skill.stars && skill.stars > 0 && (
                  <span className="flex items-center gap-1 text-xs text-trae-text-secondary">
                    <Star className="w-3 h-3" />
                    {formatInstalls(skill.stars)}
                  </span>
                )}
              </div>
              {(skill.description || skill.repoDescription) && (
                <div className="mt-2 space-y-1">
                  {skill.description ? (
                    <>
                      <p className={`text-xs line-clamp-1 ${showTranslation ? 'text-trae-text-secondary/60' : 'text-trae-text-secondary'}`}>
                        {skill.description}
                      </p>
                      {showTranslation && (
                        <p className="text-xs text-trae-accent line-clamp-1 flex items-start gap-1">
                          <Languages className="w-3 h-3 shrink-0 mt-0.5" />
                          {displayTranslated}
                        </p>
                      )}
                    </>
                  ) : skill.repoDescription ? (
                    <p className="text-xs text-trae-text-secondary/70 line-clamp-1 flex items-start gap-1">
                      <Github className="w-3 h-3 shrink-0 mt-0.5" />
                      {skill.repoDescription}
                    </p>
                  ) : null}
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex items-center gap-1.5 mt-3 overflow-hidden">
                  <Tag className="w-3 h-3 text-trae-text-secondary/50 shrink-0" />
                  {visibleTags.map((tag) => (
                    <button
                      key={tag}
                      data-tag
                      onClick={(e) => handleTagClick(e, tag)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                        selectedTags.includes(tag)
                          ? 'bg-trae-accent/20 text-trae-accent border border-trae-accent/30'
                          : 'bg-trae-card/60 text-trae-text-secondary border border-transparent hover:bg-trae-accent/10 hover:text-trae-accent hover:border-trae-accent/20'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                  {extraTagsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-trae-card/40 text-trae-text-secondary/70 border border-transparent">
                      +{extraTagsCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <button
                data-favorite
                onClick={handleFavoriteClick}
                aria-label={isFav ? '取消收藏' : '收藏'}
                className={`p-2 rounded-lg transition-all ${
                  isFav
                    ? 'text-trae-accent bg-trae-accent/10'
                    : 'text-trae-text-secondary hover:text-trae-accent hover:bg-trae-card/60 opacity-0 group-hover:opacity-100 focus:opacity-100'
                }`}
                title={isFav ? '取消收藏' : '收藏'}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={isFav ? 'filled' : 'outline'}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ 
                      scale: heartAnimating ? [1, 1.4, 1] : 1, 
                      opacity: 1,
                      rotate: heartAnimating ? [0, -10, 10, -10, 0] : 0,
                    }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={springMedium}
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                  </motion.div>
                </AnimatePresence>
              </button>
              <button
                data-copy
                onClick={handleCopyClick}
                aria-label="复制安装命令"
                className="p-2 rounded-lg text-trae-text-secondary hover:text-trae-text hover:bg-trae-card/60 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="复制安装命令"
              >
                {copied ? <Check className="w-4 h-4 text-trae-success" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                data-install
                onClick={handleInstallClick}
                disabled={installing || isInstalled}
                aria-label={isInstalled ? '已安装' : installing ? '安装中' : `安装 ${skill.name}`}
                aria-busy={installing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isInstalled
                    ? 'bg-trae-success/10 text-trae-success cursor-default'
                    : installing
                    ? 'bg-trae-accent/20 text-trae-accent cursor-wait'
                    : 'bg-trae-accent/10 text-trae-accent hover:bg-trae-accent/20 active:bg-trae-accent/30'
                }`}
              >
                <Download
                  className={`w-3.5 h-3.5 ${installing ? 'animate-pulse' : ''}`}
                />
                {isInstalled ? '已安装' : installing ? '安装中...' : '安装'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
