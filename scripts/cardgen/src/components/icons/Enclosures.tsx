import React from 'react';
import SpecialEnclosureComponent from '@/components/icons/SpecialEnclosure';
import { cn } from '@/lib/utils';
import { SpecialEnclosure } from '@/types/SpecialEnclosure';
import StandardEnclosure from './StandardEnclosure';

interface EnclosuresProps {
  size: number;
  rock?: number;
  water?: number;
  electrical?: number;
  canBeInStandardEnclosure?: boolean;
  specialEnclosures?: SpecialEnclosure[];
}

const Enclosures: React.FC<EnclosuresProps> = ({
  size,
  rock,
  water,
  electrical,
  canBeInStandardEnclosure,
  specialEnclosures,
}) => {
  const hasSpecialEnclosures =
    specialEnclosures && specialEnclosures.length > 0;
  const needWide =
    hasSpecialEnclosures ||
    (rock && rock > 0) ||
    (water && water > 0) ||
    (electrical && electrical > 0);
  const enclosureClass = cn('animal-card-enclosure-cost', {
    wide: needWide,
  });

  return (
    <div className={enclosureClass}>
      <div
        className={
          canBeInStandardEnclosure !== undefined && !canBeInStandardEnclosure
            ? 'animal-card-enclosure-forbidden'
            : 'animal-card-enclosure'
        }
      >
        <StandardEnclosure
          size={size}
          rock={rock}
          water={water}
          electrical={electrical}
          forbidden={
            canBeInStandardEnclosure !== undefined && !canBeInStandardEnclosure
          }
        />
        {hasSpecialEnclosures && (
          <SpecialEnclosureComponent specialEnclosures={specialEnclosures} />
        )}
      </div>
    </div>
  );
};

export default Enclosures;
