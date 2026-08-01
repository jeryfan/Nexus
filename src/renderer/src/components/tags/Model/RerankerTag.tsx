import { ArrowUpDown } from 'lucide-react'

import type { CustomTagProps } from '../CustomTag'
import CustomTag from '../CustomTag'

type Props = {
  size?: number
  showTooltip?: boolean
  showLabel?: boolean
} & Omit<CustomTagProps, 'size' | 'tooltip' | 'icon' | 'color' | 'children'>

export const RerankerTag = ({ size = 12, showTooltip, showLabel = true, ...restProps }: Props) => {
  return (
    <CustomTag
      size={size}
      color="#6495ED"
      icon={<ArrowUpDown size={size} color="currentColor" className="text-current" />}
      tooltip={showTooltip ? '重排' : undefined}
      {...restProps}
    >
      {showLabel ? '重排' : ''}
    </CustomTag>
  )
}

