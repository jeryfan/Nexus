import { Video } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const VideoTag = ({ size = 12, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#722ed1"
      icon={<Video size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '视频' : undefined}
      {...restProps}
    >
      {showLabel ? '视频' : ''}
    </CustomTag>
  )
}
