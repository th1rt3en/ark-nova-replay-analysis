import React from 'react';

interface StandardEnclosureProps {
  size: number | string;
  rock?: number;
  water?: number;
  electrical?: number;
  forbidden: boolean;
}

const StandardEnclosure: React.FC<StandardEnclosureProps> = ({
  size,
  rock = 0,
  water = 0,
  electrical = 0,
  forbidden,
}) => {
  const baseClass = forbidden
    ? 'icon-enclosure-forbidden'
    : 'icon-enclosure-regular';
  const classes: string[] = [];

  if (electrical >= 2) {
    classes.push('electrical-electrical');
  } else if (electrical === 1 && rock === 1) {
    classes.push('electrical-rock');
  } else if (electrical === 1 && water === 1) {
    classes.push('electrical-water');
  } else if (electrical === 1) {
    classes.push('electrical');
  } else if (rock > 1) {
    classes.push('rock-rock');
  } else if (rock === 1 && water === 1) {
    classes.push('rock-water');
  } else if (rock === 1) {
    classes.push('rock');
  } else if (water > 1) {
    classes.push('water-water');
  } else if (water === 1) {
    classes.push('water');
  }

  const fullClass =
    classes.length > 0 ? `${baseClass}-${classes.join('-')}` : baseClass;
  return <div className={'arknova-icon ' + fullClass}>{size}</div>;
};

export default StandardEnclosure;
