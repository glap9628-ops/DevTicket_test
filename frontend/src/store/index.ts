import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
  reducer: {
    // 도메인별 slice 추가 예정
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
