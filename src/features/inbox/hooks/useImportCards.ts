import { useMemo } from 'react';
import type { Order } from '@/data/orderTypes';
import type { ImportBatchDetail } from '@/lib/retailApi';
import {
  buildCards,
  toRowVM,
  type CardVM,
  type RowVM,
} from '@/features/inbox/utils/importCardModel';

export type ImportCardStats = {
  review: number;
  approved: number;
  cancelled: number;
  rejected: number;
  error: number;
  value: number;
  total: number;
  totalRows: number;
};

// รวม logic การแปลง batch detail + orders → rows/cards/stats ไว้ที่เดียว (pure derivation)
export function useImportCards(details: ImportBatchDetail[], orders: Order[]) {
  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const rows = useMemo<RowVM[]>(
    () =>
      details.flatMap((detail) =>
        detail.rows.map((row) => toRowVM(row, detail.fileName, ordersById)),
      ),
    [details, ordersById],
  );

  // 1 card = 1 draft order — CSV ที่มี orderNo เดียวกันหลายแถว (หรือถูก merge แล้ว) รวมเป็น card เดียว
  const cards = useMemo<CardVM[]>(() => buildCards(rows), [rows]);

  const stats = useMemo<ImportCardStats>(() => {
    let review = 0;
    let approved = 0;
    let cancelled = 0;
    let rejected = 0;
    let error = 0;
    let value = 0;
    for (const card of cards) {
      if (card.kind === 'review') review += 1;
      else if (card.kind === 'approved') approved += 1;
      else if (card.kind === 'cancelled') cancelled += 1;
      else if (card.kind === 'rejected') rejected += 1;
      else error += 1;
      if (card.primary.value) value += card.primary.value;
    }
    return {
      review,
      approved,
      cancelled,
      rejected,
      error,
      value,
      total: cards.length,
      totalRows: rows.length,
    };
  }, [cards, rows.length]);

  return { ordersById, rows, cards, stats };
}
