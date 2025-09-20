import {eq} from 'drizzle-orm';
import fastifyPlugin from 'fastify-plugin';
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from 'fastify-type-provider-zod';
import {z} from 'zod';
import {orders} from '@/db/schema.js';

export const myController = fastifyPlugin(async server => {
	// Add schema validator and serializer
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	server.withTypeProvider<ZodTypeProvider>().post('/orders/:orderId/processOrder', {
		schema: {
			params: z.object({
				orderId: z.coerce.number(),
			}),
		},
	}, async (request, reply) => {
		const database = server.diContainer.resolve('db');
		const orderProcessingService = server.diContainer.resolve('orderProcessingService');

		const order = (await database.query.orders
			.findFirst({
				where: eq(orders.id, request.params.orderId),
				with: {
					products: {
						columns: {},
						with: {
							product: true,
						},
					},
				},
			}))!;

		console.log(order);

		const {products: productList} = order;

		if (productList) {
			const productsToProcess = productList.map(({product}) => product);
			await orderProcessingService.processOrder(productsToProcess);
		}

		await reply.send({orderId: order.id});
	});
});

