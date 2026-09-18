import { Mail, MessageCircle, Instagram, Facebook, Linkedin, Globe } from 'lucide-react';
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
  facebook: Facebook,
  linkedin: Linkedin,
  website_form: Globe,
};

const colorMap = {
  email: 'text-brand-600',
  whatsapp: 'text-emerald-600',
  instagram: 'text-violet-600',
  facebook: 'text-indigo-600',
  linkedin: 'text-blue-700',
  website_form: 'text-teal-600',
};

export function ChannelIcon({ channel, className = '', size = 16 }: ChannelIconProps) {
  const Icon = iconMap[channel] || Mail;
  return <Icon size={size} className={`${colorMap[channel] || 'text-slate-600'} ${className}`} />;
}
