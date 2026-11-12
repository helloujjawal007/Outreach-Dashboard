import { Mail, MessageCircle, Globe } from 'lucide-react';
import type { Channel } from '@/types';

interface ChannelIconProps {
  channel: Channel;
  className?: string;
  size?: number;
}

const iconMap: Record<Channel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  website_form: Globe,
};

const colorMap: Record<Channel, string> = {
  email: 'text-brand-600',
  whatsapp: 'text-emerald-600',
  website_form: 'text-teal-600',
};

export function ChannelIcon({ channel, className = '', size = 16 }: ChannelIconProps) {
  const Icon = iconMap[channel] || Mail;
  return <Icon size={size} className={`${colorMap[channel] || 'text-slate-600'} ${className}`} />;
}
