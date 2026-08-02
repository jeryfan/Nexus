import { Eye } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const VisionTag = ({ size = 12, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#00b96b"
      icon={<Eye size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '视觉' : undefined}
      {...restProps}
    >
      {showLabel ? '视觉' : ''}
    </CustomTag>
  )
}
