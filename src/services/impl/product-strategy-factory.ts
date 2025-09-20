import {type INotificationService} from '../notifications.port.js';
import {
	type IProductStrategy,
	NormalProductStrategy,
	SeasonalProductStrategy,
	ExpirableProductStrategy,
} from './product-strategy.js';
import {type Product} from '@/db/schema.js';

export class ProductStrategyFactory {
	constructor(private readonly notificationService: INotificationService) {}

	createStrategy(productType: Product['type']): IProductStrategy {
		switch (productType) {
			case 'NORMAL': {
				return new NormalProductStrategy(this.notificationService);
			}

			case 'SEASONAL': {
				return new SeasonalProductStrategy(this.notificationService);
			}

			case 'EXPIRABLE': {
				return new ExpirableProductStrategy(this.notificationService);
			}

			default: {
				throw new Error(`Unknown product type: ${productType}`);
			}
		}
	}
}
