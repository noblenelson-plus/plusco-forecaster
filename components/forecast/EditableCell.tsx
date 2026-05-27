'use client';

import { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, parseCurrencyString } from './utils';
import { MONTHS_LONG, MONTHS_SHORT } from './types';

interface EditableCellProps {
  value: number;
  rowId: string;
  monthIndex: number;
  isEditable: boolean;
  onUpdate: (newValue: number) => void;
}

export function EditableCell({ value, rowId, monthIndex, isEditable, onUpdate }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const [error, setError] = useState('');

  const handleSave = async () => {
    const newValue = parseMonthValue(editValue);
    const monthField = MONTHS_LONG[monthIndex];

    try {
      const docRef = doc(db, 'forecasts', rowId);
      await updateDoc(docRef, { [monthField]: newValue });
      onUpdate(newValue);
      setIsEditing(false);
      setError('');
    } catch (err) {
      console.error('Failed to update cell:', err);
      setError('Failed to save');
    }
  };

  if (isEditing && isEditable) {
    return (
      <input
        autoFocus
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setIsEditing(false);
        }}
        className="w-full px-2 py-1 border border-blue-500 rounded bg-blue-50 text-right"
      />
    );
  }

  return (
    <div
      onClick={() => isEditable && setIsEditing(true)}
      className={`text-right py-2 px-3 ${isEditable ? 'cursor-pointer hover:bg-blue-50 rounded' : ''}`}
    >
      {error ? <span className="text-red-500 text-xs">{error}</span> : formatCurrency(value)}
    </div>
  );
}
