import { Mail, MessageCircle, Instagram } from 'lucide-react';
import type { Channel } from '@/types';

interface ChannelIconProps {
  channel: Channel;
  className?: string;
  size?: number;
}

const iconMap = {
  email: Mail,
  whatsapp: MessageCircle,
  instagram: Instagram,
};

const colorMap = {
  email: 'text-brand-600',
  whatsapp: 'text-emerald-600',
  instagram: 'text-violet-600',
};

export function ChannelIcon({ channel, className = '', size = 16 }: ChannelIconProps) {
  const Icon = iconMap[channel];
  return <Icon size={size} className={`${colorMap[channel]} ${className}`} />;
}
