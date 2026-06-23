import { TICKET_TYPE_PREFIX, TICKET_TYPE_LABEL, type TicketType } from '@/types/ticket';

interface Props {
  type: TicketType;
  showLabel?: boolean;
  className?: string;
}

const TypeBadge = ({ type, showLabel = false, className = '' }: Props) => {
  return (
    <span
      className={`inline-flex items-center py-0.5 text-xs font-medium text-gray-600 ${className}`}
    >
      {showLabel ? TICKET_TYPE_LABEL[type] : TICKET_TYPE_PREFIX[type]}
    </span>
  );
};

export default TypeBadge;
