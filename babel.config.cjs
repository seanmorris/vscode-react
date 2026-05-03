module.exports = function(api)
{
	const envName = api.env();
	api.cache.using(() => envName);

	const modules = envName === 'esm' ? false : 'commonjs';

	return {
		presets: [
			['@babel/preset-env', { modules }]
			, ['@babel/preset-react', { runtime: 'automatic' }]
		]
	};
};
