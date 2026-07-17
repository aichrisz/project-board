import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {description ? <p className="empty-desc">{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}
