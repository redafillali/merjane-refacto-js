import {type INotificationService} from '../notifications.port.js';
import {type Product} from '@/db/schema.js';

export type IProductStrategy = {
	processOrder(product: Product): Promise<ProductProcessingResult>;
};

export type ProductProcessingResult = {
	shouldUpdateStock: boolean;
	updatedProduct?: Partial<Product>;
	notificationAction?: () => void;
};

export class NormalProductStrategy implements IProductStrategy {
	constructor(private readonly notificationService: INotificationService) {}

	async processOrder(product: Product): Promise<ProductProcessingResult> {
		if (product.available > 0) {
			return {
				shouldUpdateStock: true,
				updatedProduct: {
					...product,
					available: product.available - 1,
				},
			};
		}

		// Product is out of stock, check lead time
		if (product.leadTime > 0) {
			return {
				shouldUpdateStock: true,
				updatedProduct: {
					...product,
					leadTime: product.leadTime,
				},
				notificationAction: () => {
					this.notificationService.sendDelayNotification(product.leadTime, product.name);
				},
			};
		}

		// No action needed if no lead time
		return {shouldUpdateStock: false};
	}
}

export class SeasonalProductStrategy implements IProductStrategy {
	constructor(private readonly notificationService: INotificationService) {}

	async processOrder(product: Product): Promise<ProductProcessingResult> {
		const currentDate = new Date();
		const millisecondsPerDay = 1000 * 60 * 60 * 24;

		// Check if product is in season and available
		if (currentDate > product.seasonStartDate!
			&& currentDate < product.seasonEndDate!
			&& product.available > 0) {
			return {
				shouldUpdateStock: true,
				updatedProduct: {
					...product,
					available: product.available - 1,
				},
			};
		}

		// Product is out of stock or out of season
		if (product.available === 0) {
			// Check if lead time would exceed season end
			const restockDate = new Date(currentDate.getTime() + (product.leadTime * millisecondsPerDay));
			if (restockDate > product.seasonEndDate!) {
				return {
					shouldUpdateStock: true,
					updatedProduct: {
						...product,
						available: 0,
					},
					notificationAction: () => {
						this.notificationService.sendOutOfStockNotification(product.name);
					},
				};
			}

			// Lead time is within season, notify delay
			return {
				shouldUpdateStock: true,
				updatedProduct: {
					...product,
					leadTime: product.leadTime,
				},
				notificationAction: () => {
					this.notificationService.sendDelayNotification(product.leadTime, product.name);
				},
			};
		}

		// Product is out of season
		if (product.seasonStartDate! > currentDate) {
			return {
				shouldUpdateStock: false,
				notificationAction: () => {
					this.notificationService.sendOutOfStockNotification(product.name);
				},
			};
		}

		return {shouldUpdateStock: false};
	}
}

export class ExpirableProductStrategy implements IProductStrategy {
	constructor(private readonly notificationService: INotificationService) {}

	async processOrder(product: Product): Promise<ProductProcessingResult> {
		const currentDate = new Date();

		// Check if product is available and not expired
		if (product.available > 0 && product.expiryDate! > currentDate) {
			return {
				shouldUpdateStock: true,
				updatedProduct: {
					...product,
					available: product.available - 1,
				},
			};
		}

		// Product is expired or unavailable
		return {
			shouldUpdateStock: true,
			updatedProduct: {
				...product,
				available: 0,
			},
			notificationAction: () => {
				this.notificationService.sendExpirationNotification(product.name, product.expiryDate!);
			},
		};
	}
}
