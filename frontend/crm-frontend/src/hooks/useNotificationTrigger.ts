'use client';

import { useCallback } from 'react';
import { notificationTriggerService } from '@/lib/notifications/notification-trigger.service';

export function useNotificationTrigger() {
  const sendTest = useCallback((type?: string) => {
    notificationTriggerService.sendTestNotification(type);
  }, []);

  const notifyLogin = useCallback((userName: string) => {
    notificationTriggerService.notifyLogin(userName);
  }, []);

  const notifyEdit = useCallback((itemName: string, itemType?: string) => {
    notificationTriggerService.notifyEdit(itemName, itemType);
  }, []);

  const notifyDelete = useCallback((itemName: string, itemType?: string) => {
    notificationTriggerService.notifyDelete(itemName, itemType);
  }, []);

  const notifyBatchCreated = useCallback((batchName: string) => {
    notificationTriggerService.notifyBatchCreated(batchName);
  }, []);

  const notifyBatchDeleted = useCallback((batchName: string) => {
    notificationTriggerService.notifyBatchDeleted(batchName);
  }, []);

  const notifyBatchShared = useCallback((batchName: string, userCount: number) => {
    notificationTriggerService.notifyBatchShared(batchName, userCount);
  }, []);

  const notifyDataUploaded = useCallback((rowCount: number) => {
    notificationTriggerService.notifyDataUploaded(rowCount);
  }, []);

  const notifyUserAdded = useCallback((email: string) => {
    notificationTriggerService.notifyUserAdded(email);
  }, []);

  const notifySystemAlert = useCallback((message: string) => {
    notificationTriggerService.notifySystemAlert(message);
  }, []);

  return {
    sendTest,
    notifyLogin,
    notifyEdit,
    notifyDelete,
    notifyBatchCreated,
    notifyBatchDeleted,
    notifyBatchShared,
    notifyDataUploaded,
    notifyUserAdded,
    notifySystemAlert,
  };
}
