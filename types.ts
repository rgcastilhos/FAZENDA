
export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  photo?: string; // Base64 string
  categoryId: string;
  createdAt: number;
  isSelectedForSum: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface CardOptions {
  showPhoto: boolean;
  showRef: boolean;
  showQuantity: boolean;
  showDate: boolean;
  showCheckbox: boolean;
}

export interface AppSettings {
  backgroundImage?: string;
  userEmail?: string;
  lastSync?: number;
  theme?: 'emerald' | 'blue' | 'amber' | 'slate' | 'rose' | 'brown';
  farmName?: string;
  cardOptions?: CardOptions;
}

export interface AppState {
  categories: Category[];
  items: InventoryItem[];
  settings: AppSettings;
}