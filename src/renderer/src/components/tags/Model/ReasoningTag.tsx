import { Lightbulb } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const ReasoningTag = ({ size = 12, showTooltip, showLabel, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#6372bd"
      icon={<Lightbulb size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '推理' : undefined}
      {...restProps}
    >
      {showLabel ? '推理' : ''}
    </CustomTag>
  )
}

