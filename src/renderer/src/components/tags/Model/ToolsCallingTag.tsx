import { Wrench } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const ToolsCallingTag = ({ size = 12, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#f18737"
      icon={<Wrench size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '工具' : undefined}
      {...restProps}
    >
      {showLabel ? '工具' : ''}
    </CustomTag>
  )
}

