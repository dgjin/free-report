import React from 'react';
import {
  WarningCircle, ArrowLeft, ArrowRight, Prohibit, ChartBar, BookOpen, Buildings, Calculator, CalendarBlank,
  CheckCircle, CheckSquare, CaretDown, Clock, Copy, Download, PencilSimple, Eye, Files, FileArrowDown,
  Table, FileText, GridFour, Hash, Question, ClockCounterClockwise, Tray, Stack, SquaresFour, ListBullets,
  ListPlus, Lock, SignOut, List, ChatCircle, Plus, Power, ArrowsClockwise, ArrowCounterClockwise, FloppyDisk,
  MagnifyingGlass, PaperPlaneRight, Shield, ShieldCheck, SlidersHorizontal, Trash, TrendUp, TextT, Upload,
  User, UserCheck, FlowArrow, X, XCircle, Lightning, Palette, CaretRight, CaretLeft,
  ArrowsOut, ArrowsIn, Sparkle,
} from '@phosphor-icons/react';

/**
 * Phosphor 图标别名层（Bold weight 统一注入）
 * 保持 lucide 命名，业务代码只需把 import 路径从 'lucide-react' 换到本文件。
 */

type IconProps = React.ComponentProps<typeof SquaresFour>;
type IconComponent = React.FC<IconProps>;

const bold = (C: IconComponent): IconComponent => {
  const Wrapped: React.FC<IconProps> = (props) => <C weight="bold" {...props} />;
  return Wrapped;
};

export const AlertCircle = bold(WarningCircle);
export const ArrowLeftIcon = bold(ArrowLeft);
export { ArrowLeftIcon as ArrowLeft };
export const ArrowRightIcon = bold(ArrowRight);
export { ArrowRightIcon as ArrowRight };
export const Ban = bold(Prohibit);
export const BarChart3 = bold(ChartBar);
export const BookOpenIcon = bold(BookOpen);
export { BookOpenIcon as BookOpen };
export const Building2 = bold(Buildings);
export const CalculatorIcon = bold(Calculator);
export { CalculatorIcon as Calculator };
export const Calendar = bold(CalendarBlank);
export const CheckCircleIcon = bold(CheckCircle);
export { CheckCircleIcon as CheckCircle };
export const CheckCircle2 = bold(CheckCircle);
export const CheckSquareIcon = bold(CheckSquare);
export { CheckSquareIcon as CheckSquare };
export const ChevronDown = bold(CaretDown);
export const ClockIcon = bold(Clock);
export { ClockIcon as Clock };
export const CopyIcon = bold(Copy);
export { CopyIcon as Copy };
export const DownloadIcon = bold(Download);
export { DownloadIcon as Download };
export const Edit = bold(PencilSimple);
export const EyeIcon = bold(Eye);
export { EyeIcon as Eye };
export const FileCheck2 = bold(Files);
export const FileDown = bold(FileArrowDown);
export const FileSpreadsheet = bold(Table);
export const FileTextIcon = bold(FileText);
export { FileTextIcon as FileText };
export const Grid3x3 = bold(GridFour);
export const HashIcon = bold(Hash);
export { HashIcon as Hash };
export const HelpCircle = bold(Question);
export const History = bold(ClockCounterClockwise);
export const Inbox = bold(Tray);
export const Layers = bold(Stack);
export const LayoutDashboard = bold(SquaresFour);
export const ListIcon = bold(ListBullets);
export { ListIcon as List };
export const ListPlusIcon = bold(ListPlus);
export { ListPlusIcon as ListPlus };
export const LockIcon = bold(Lock);
export { LockIcon as Lock };
export const LogOut = bold(SignOut);
export const Menu = bold(List);
export const MessageSquare = bold(ChatCircle);
export const PlusIcon = bold(Plus);
export { PlusIcon as Plus };
export const PowerIcon = bold(Power);
export { PowerIcon as Power };
export const RefreshCw = bold(ArrowsClockwise);
export const RotateCcw = bold(ArrowCounterClockwise);
export const Save = bold(FloppyDisk);
export const Search = bold(MagnifyingGlass);
export const Send = bold(PaperPlaneRight);
export const ShieldIcon = bold(Shield);
export { ShieldIcon as Shield };
export const ShieldCheckIcon = bold(ShieldCheck);
export { ShieldCheckIcon as ShieldCheck };
export const Sliders = bold(SlidersHorizontal);
export const TrashIcon = bold(Trash);
export { TrashIcon as Trash };
export const Trash2 = bold(Trash);
export const TrendingUp = bold(TrendUp);
export const Type = bold(TextT);
export const UploadIcon = bold(Upload);
export { UploadIcon as Upload };
export const UserIcon = bold(User);
export { UserIcon as User };
export const UserCheckIcon = bold(UserCheck);
export { UserCheckIcon as UserCheck };
export const Workflow = bold(FlowArrow);
export const XIcon = bold(X);
export { XIcon as X };
export const XCircleIcon = bold(XCircle);
export { XCircleIcon as XCircle };
export const ChevronRightIcon = bold(CaretRight);
export { ChevronRightIcon as ChevronRight };
export const ChevronLeftIcon = bold(CaretLeft);
export { ChevronLeftIcon as ChevronLeft };
export const Zap = bold(Lightning);
export const PaletteIcon = bold(Palette);
export { PaletteIcon as Palette };
export const Maximize2 = bold(ArrowsOut);
export const Minimize2 = bold(ArrowsIn);
export const Sparkles = bold(Sparkle);
