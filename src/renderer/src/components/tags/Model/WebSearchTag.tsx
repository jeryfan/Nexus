import { Globe } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const WebSearchTag = ({ size = 12, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#1677ff"
      icon={<Globe size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '联网' : undefined}
      {...restProps}
    >
      {showLabel ? '联网' : ''}
    </CustomTag>
  )
}
