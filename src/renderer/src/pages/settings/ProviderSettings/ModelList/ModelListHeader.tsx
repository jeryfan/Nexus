import { Tooltip } from '@nexus/ui'
import { cn } from '@renderer/utils/style'
import { ChevronsDownUp, ChevronsUpDown, FileText, Filter, Search, X } from 'lucide-react'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

import { modelListClasses } from '../primitives/ProviderSettingsPrimitives'
import type { ModelListCapabilityCounts, ModelListCapabilityFilter } from './modelListDerivedState'
import { ModelTypeFilterTabs } from './ModelTypeFilterTabs'

export interface ModelListHeaderProps {
  isBusy: boolean
  hasNoModels: boolean
  searchText: string
  setSearchText: (text: string) => void
  selectedTypeFilter: ModelListCapabilityFilter
  setSelectedTypeFilter: (filter: ModelListCapabilityFilter) => void
  typeCounts: ModelListCapabilityCounts
  groupsExpanded: boolean
  onToggleGroupsExpanded: () => void
  docsWebsite?: string
  modelsWebsite?: string
  actions?: React.ReactNode
}

const ModelListHeader: React.FC<ModelListHeaderProps> = ({
  isBusy,
  hasNoModels,
  searchText,
  setSearchText,
  selectedTypeFilter,
  setSelectedTypeFilter,
  typeCounts,
  groupsExpanded,
  onToggleGroupsExpanded,
  docsWebsite,
  modelsWebsite,
  actions
}) => {
  const docsLink = modelsWebsite || docsWebsite
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isSearchExpanded = searchOpen || Boolean(searchText)
  const isFilterActive = selectedTypeFilter !== 'all'
  const GroupExpansionIcon = groupsExpanded ? ChevronsDownUp : ChevronsUpDown

  useEffect(() => {
    if (isSearchExpanded) {
      searchInputRef.current?.focus()
    }
  }, [isSearchExpanded])

  return (
    <>
      <div className={modelListClasses.headerInlineRow}>
        <div className={modelListClasses.sectionTitleLine}>
          <h2 className={modelListClasses.sectionTitle}>{'模型'}</h2>
          {docsLink ? (
            <div className={modelListClasses.titleHelpRow}>
              <Tooltip content={'模型文档'}>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={docsLink}
                  aria-label={'模型文档'}
                  className={modelListClasses.searchIconButton}
                >
                  <FileText className={modelListClasses.toolbarHeaderIcon} aria-hidden />
                </a>
              </Tooltip>
            </div>
          ) : null}
          <Tooltip content={groupsExpanded ? '全部折叠' : '全部展开'}>
            <button
              type="button"
              className={modelListClasses.groupToggleIconButton}
              aria-label={groupsExpanded ? '全部折叠' : '全部展开'}
              disabled={isBusy || hasNoModels}
              onClick={onToggleGroupsExpanded}
            >
              <GroupExpansionIcon className={modelListClasses.toolbarHeaderIcon} />
            </button>
          </Tooltip>
          {isSearchExpanded ? (
            <div className={modelListClasses.searchCompactWrap}>
              <Search className={modelListClasses.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                value={searchText}
                placeholder={'搜索模型...'}
                disabled={isBusy}
                onChange={(event) => setSearchText(event.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => {
                  if (!searchText) {
                    setSearchOpen(false)
                  }
                }}
                className={modelListClasses.searchInput}
              />
              {searchText ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchText('')
                    setSearchOpen(false)
                  }}
                  className={modelListClasses.searchClear}
                  aria-label={'清除'}
                >
                  <X size={9} />
                </button>
              ) : null}
            </div>
          ) : (
            <Tooltip content={'搜索'}>
              <button
                type="button"
                className={modelListClasses.searchIconButton}
                aria-label={'搜索'}
                disabled={isBusy}
                onClick={() => setSearchOpen(true)}
              >
                <Search className={modelListClasses.toolbarHeaderIcon} />
              </button>
            </Tooltip>
          )}
          <Tooltip content={'筛选模型'}>
            <button
              type="button"
              className={cn(
                modelListClasses.searchIconButton,
                (filterOpen || isFilterActive) && 'bg-accent/40 text-foreground'
              )}
              aria-label={'筛选模型'}
              aria-pressed={filterOpen}
              disabled={isBusy || hasNoModels}
              onClick={() => setFilterOpen((open) => !open)}
            >
              <Filter className={modelListClasses.toolbarHeaderIcon} />
            </button>
          </Tooltip>
        </div>
        <div className={modelListClasses.headerInlineActions}>
          <div className={modelListClasses.titleActions}>{actions}</div>
        </div>
      </div>
      {filterOpen ? (
        <ModelTypeFilterTabs
          value={selectedTypeFilter}
          onValueChange={(next) => setSelectedTypeFilter(next as ModelListCapabilityFilter)}
          counts={typeCounts}
        />
      ) : null}
    </>
  )
}

export default ModelListHeader
