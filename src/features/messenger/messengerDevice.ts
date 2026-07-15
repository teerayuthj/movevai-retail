import { Capacitor } from '@capacitor/core';

const DEVICE_KEY = 'movevai:messenger-device-id';

export function getMessengerDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getMessengerPlatform(): 'web' | 'ios' | 'android' {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}
