// Business pages now render inside App.tsx and share its left navigation.
// An older import './damany-addons' in main.tsx remains safe: no dock is mounted.
import './styles.css';
import './shell.css';
export {Warehouse} from './Warehouse';
export {Quotations} from './Quotations';
export {Reports} from './Reports';
