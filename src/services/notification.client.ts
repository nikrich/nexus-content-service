const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3003';
const SERVICE_TOKEN = process.env.NEXUS_SERVICE_TOKEN || 'nexus-internal-service-token';

interface SendNotificationRequest {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, string>;
}

export async function sendNotification(req: SendNotificationRequest): Promise<void> {
  try {
    await fetch(`${NOTIFICATION_SERVICE_URL}/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_TOKEN}`,
      },
      body: JSON.stringify(req),
    });
  } catch (err) {
    // Fire-and-forget: log but don't throw
    console.error('Failed to send notification:', err);
  }
}

export function notifyTaskAssigned(taskId: string, taskTitle: string, assigneeId: string, assignedBy: string): void {
  sendNotification({
    userId: assigneeId,
    type: 'task_assigned',
    title: 'Task Assigned',
    body: `You have been assigned to task: ${taskTitle}`,
    metadata: { taskId, assignedBy },
  });
}

export function notifyTaskStatusChanged(
  taskId: string,
  taskTitle: string,
  fromStatus: string,
  toStatus: string,
  changedBy: string,
  notifyUserIds: string[],
): void {
  for (const userId of notifyUserIds) {
    if (userId === changedBy) continue;
    sendNotification({
      userId,
      type: 'task_status_changed',
      title: 'Task Status Changed',
      body: `Task "${taskTitle}" changed from ${fromStatus} to ${toStatus}`,
      metadata: { taskId, fromStatus, toStatus, changedBy },
    });
  }
}

export function notifyCommentAdded(
  taskId: string,
  taskTitle: string,
  commentAuthorId: string,
  notifyUserIds: string[],
): void {
  for (const userId of notifyUserIds) {
    if (userId === commentAuthorId) continue;
    sendNotification({
      userId,
      type: 'comment_added',
      title: 'New Comment',
      body: `New comment on task: ${taskTitle}`,
      metadata: { taskId, commentAuthorId },
    });
  }
}
