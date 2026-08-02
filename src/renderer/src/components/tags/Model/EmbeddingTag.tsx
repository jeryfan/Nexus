import { Boxes } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const EmbeddingTag = ({ size = 12, showTooltip, showLabel = true, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#FFA500"
      icon={<Boxes size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '嵌入' : undefined}
      {...restProps}
    >
      {showLabel ? '嵌入' : ''}
    </CustomTag>
  )
}
