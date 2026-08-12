import React from 'react'
import SegmentedTabs, { type SegmentedTabOption } from '@/components/ui/SegmentedTabs'

interface TabWorkspaceProps<T extends string> {
  eyebrow?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Badges / status pills under the subtitle in the rail card. */
  meta?: React.ReactNode
  /** Primary action for the section, e.g. "Post a drive". */
  actions?: React.ReactNode
  /** Stat tiles inside the rail card, under the copy. */
  stats?: React.ReactNode
  /**
   * The illustrated panel between the card and the roadmap. Changing it per
   * tab is what stops every section's rail looking the same — see
   * SectionArtwork.
   */
  artwork?: React.ReactNode
  /** Sits under the artwork — normally a SectionRoadmap. */
  rail?: React.ReactNode
  tabs: SegmentedTabOption<T>[]
  value: T
  onChange: (value: T) => void
  tabsAriaLabel: string
  /** Right-hand toolbar beside the tabs — counts, filters, secondary links. */
  tabsAside?: React.ReactNode
  children: React.ReactNode
}

/**
 * The shared shell for every tabbed section: context on the left, the working
 * area on the right.
 *
 * These screens used to stack — a full-width banner carrying the title, the
 * tabs and any stats, and the content in one column underneath it. Two things
 * were wrong with that. The banner ate the top of every viewport before you
 * reached what you came for, and on a laptop the content column below it
 * still ran narrow, leaving dead margin down both sides while the banner
 * spanned the full width. Splitting the two puts the explanation somewhere it
 * can stay visible without costing vertical space, and lets the working area
 * use the width it was wasting.
 *
 * The rail is `position: sticky` on wide screens, so the section's context and
 * its roadmap stay put while a long list scrolls beside them. Below `xl` it
 * collapses to the top of a single column, because a 320px rail beside a
 * 400px list is worse than either alone.
 *
 * The tabs live here, above the content and outside `children`, which is the
 * point: switching tabs re-renders only what the caller passes as children.
 * The rail, the heading and the tab bar itself never unmount, so a tab change
 * cannot read as a page load.
 */
export default function TabWorkspace<T extends string>({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  stats,
  artwork,
  rail,
  tabs,
  value,
  onChange,
  tabsAriaLabel,
  tabsAside,
  children,
}: TabWorkspaceProps<T>) {
  return (
    <div className="mx-auto w-full max-w-app px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[22rem_minmax(0,1fr)] 2xl:grid-cols-[24rem_minmax(0,1fr)]">
        {/* ---- Left rail: what this section is ---- */}
        <aside className="flex flex-col gap-5 xl:sticky xl:top-24 xl:self-start">
          <section className="relative isolate overflow-hidden rounded-card bg-gradient-to-br from-primary-dark via-primary to-accent p-6 shadow-lift">
            <div
              className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-accent/30 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative">
              {eyebrow && (
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
                  {eyebrow}
                </p>
              )}
              <h1 className="on-photo mt-1.5 text-2xl font-extrabold leading-tight tracking-tight text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="on-photo mt-2.5 text-sm leading-relaxed text-white/80">{subtitle}</p>
              )}
              {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
              {stats && <div className="mt-5">{stats}</div>}
              {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
            </div>
          </section>

          {/* Hidden below xl: on a stacked layout it would push the actual
              content another screen down, and it is decoration. */}
          {artwork && <div className="hidden xl:block">{artwork}</div>}

          {/* Same reasoning — the roadmap is worth its space beside the
              content, not stacked above it on a phone. */}
          {rail && <div className="hidden xl:block">{rail}</div>}
        </aside>

        {/* ---- Right: the sub-tabs and their content ---- */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              aria-label={tabsAriaLabel}
              options={tabs}
              value={value}
              onChange={onChange}
            />
            {tabsAside}
          </div>

          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  )
}
