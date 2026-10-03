/**
 * @file UI component barrel export
 * @description Re-exports all primitive/atomic UI components.
 * Add new components here to expose them via @/components/ui
 */

// ── Primitives ────────────────────────────────────────────────────────────────
export { Button } from "./Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button/Button";

export {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
} from "./Card/Card";
export type {
  CardProps,
  CardVariant,
  CardSize,
  CardHeaderProps,
  CardBodyProps,
  CardFooterProps,
} from "./Card/Card";

export {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "./Modal/Modal";
export type {
  ModalProps,
  ModalSize,
  ModalVariant,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps,
} from "./Modal/Modal";
