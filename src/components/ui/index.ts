/**
 * @file UI component barrel export
 * @description Enterprise Design System primitive UI components.
 * Exposes Button, Card, Modal, Input, Badge, and Select.
 */

// -- Primitives ----------------------------------------------------------------
export { Button } from './Button/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button/Button';

export { Card, CardHeader, CardBody, CardFooter } from './Card/Card';
export type {
  CardProps,
  CardVariant,
  CardSize,
  CardHeaderProps,
  CardBodyProps,
  CardFooterProps,
} from './Card/Card';

export { Modal, ModalHeader, ModalBody, ModalFooter } from './Modal/Modal';
export type {
  ModalProps,
  ModalSize,
  ModalVariant,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps,
} from './Modal/Modal';

export { Input } from './Input/Input';
export type { InputProps, InputVariant, InputSize } from './Input/Input';

export { Badge } from './Badge/Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './Badge/Badge';

export { Select } from './Select/Select';
export type {
  SelectProps,
  SelectVariant,
  SelectSize,
  SelectOption,
} from './Select/Select';
