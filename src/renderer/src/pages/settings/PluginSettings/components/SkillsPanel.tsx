import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Switch
} from '@nexus/ui'
import { SettingDivider, SettingGroup } from '@renderer/components/SettingsPrimitives'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { useAgentSkillsStore } from '@renderer/stores/agentSkills'
import { Box, FolderOpen, MoreHorizontal } from 'lucide-react'

/**
 * 技能 tab：全局技能列表（~/.nexus/agent/skills、~/.agents/skills、插件随附）。
 * 开关经 skillsOverride 过滤，新会话生效；项目级技能当前不加载（trust=never）。
 */
export function SkillsPanel({ query }: { query: string }): React.JSX.Element {
  const skills = useAgentSkillsStore((state) => state.skills)
  const loading = useAgentSkillsStore((state) => state.loading)
  const busy = useAgentSkillsStore((state) => state.busy)
  const setEnabled = useAgentSkillsStore((state) => state.setEnabled)
  const reveal = useAgentSkillsStore((state) => state.reveal)

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = skills.filter(
    (skill) =>
      !normalizedQuery ||
      skill.name.toLowerCase().includes(normalizedQuery) ||
      skill.description.toLowerCase().includes(normalizedQuery)
  )

  if (loading) {
    return (
      <SettingGroup>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="mt-2 h-12 w-full" />
      </SettingGroup>
    )
  }

  if (filtered.length === 0) {
    return (
      <SettingGroup>
        <div className="py-6 text-center text-foreground-muted text-xs">
          {normalizedQuery
            ? '没有匹配的技能'
            : '暂无技能。将 SKILL.md 放入 ~/.nexus/agent/skills 目录即可添加。'}
        </div>
      </SettingGroup>
    )
  }

  return (
    <SettingGroup>
      {filtered.map((skill, index) => (
        <div key={skill.filePath}>
          {index > 0 && <SettingDivider className="my-1" />}
          <div className="flex items-center gap-3 py-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-accent/40">
              <Box className="size-4 text-foreground-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-foreground text-sm font-medium">{skill.name}</div>
              <div className="mt-0.5 truncate text-foreground-muted text-xs">
                {skill.description}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-foreground-muted text-xs">{skill.sourceLabel}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md p-1 text-foreground-muted hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void reveal(skill.filePath)}>
                    <FolderOpen className="size-3.5" />
                    打开所在目录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Switch
                size="xs"
                checked={skill.enabled}
                disabled={Boolean(busy[skill.filePath])}
                onCheckedChange={(checked) => void setEnabled(skill.filePath, checked)}
              />
            </div>
          </div>
        </div>
      ))}
    </SettingGroup>
  )
}
