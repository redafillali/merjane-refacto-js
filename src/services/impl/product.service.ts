import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {type INotificationService} from '../notifications.port.js';
import {OrderProcessingService} from './order-processing.service.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

/**
 * Legacy ProductService for backward compatibility
 * @deprecated Use OrderProcessingService directly instead
 */
export class ProductService {
	private readonly notificationService: INotificationService;
	private readonly database: Database;
	private readonly orderProcessingService: OrderProcessingService;

	public constructor({ns, db}: Pick<Cradle, 'ns' | 'db'>) {
		this.notificationService = ns;
		this.database = db;
		this.orderProcessingService = new OrderProcessingService({ns, db});
	}

	public async notifyDelay(leadTime: number, product: Product): Promise<void> {
		product.leadTime = leadTime;
		await this.database.update(products).set(product).where(eq(products.id, product.id));
		this.notificationService.sendDelayNotification(leadTime, product.name);
	}

	/**
	 * @deprecated Use OrderProcessingService.processProductOrder instead
	 */
	public async handleSeasonalProduct(product: Product): Promise<void> {
		await this.orderProcessingService.processProductOrder(product);
	}

	/**
	 * @deprecated Use OrderProcessingService.processProductOrder instead
	 */
	public async handleExpiredProduct(product: Product): Promise<void> {
		await this.orderProcessingService.processProductOrder(product);
	}
}
