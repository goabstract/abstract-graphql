const fs = require("fs");
const path = require("path");
const { ApolloServer } = require("apollo-server");
const Abstract = require("abstract-sdk");

function resolversForAbstractClient({ only, ignore } = {}) {
  const transport = new Abstract.TRANSPORTS.API({
    accessToken: "NOT_AUTHED"
  });

  return Reflect.ownKeys(transport).reduce(
    (schema, endpointKey) => {
      const transportEndpoint = transport[endpointKey];

      // Ignore non-endpoints
      if (
        !transportEndpoint ||
        ["string", "number", "boolean"].includes(typeof transportEndpoint)
      ) {
        return schema;
      }

      Reflect.ownKeys(transportEndpoint).forEach(methodKey => {
        const property = `${endpointKey}.${methodKey}`;

        if (endpointKey === "accessToken") return;
        if (only && !only.includes(property)) return;
        if (ignore && ignore.includes(property)) return;

        if (["create", "update", "delete"].includes(methodKey)) {
          const endpointResolverKey = `${endpointKey.charAt(0).toUpperCase() +
            endpointKey.slice(1)}MutationEndpoint`;

          schema[endpointResolverKey] = schema[endpointResolverKey] || {};

          schema.Mutation[endpointKey] = (root, args, context) =>
            context.abstract[endpointKey];

          schema[endpointResolverKey][methodKey] = (endpoint, args) => {
            console.log(endpoint, args)
            return Promise.resolve(
              endpoint[methodKey](
                args.objectDescriptor,
                args.input ? args.input : args.options,
                args.input ? args.options : undefined,
              )
            );
          }
        } else {
          const endpointResolverKey = `${endpointKey.charAt(0).toUpperCase() +
            endpointKey.slice(1)}Endpoint`;

          schema[endpointResolverKey] = schema[endpointResolverKey] || {};

          schema.Query[endpointKey] = (root, args, context) =>
            context.abstract[endpointKey];

          schema[endpointResolverKey][methodKey] = (endpoint, args) =>
            Promise.resolve(
              endpoint[methodKey](args.objectDescriptor, args.options)
            );
        }
      });

      return schema;
    },
    { Query: {}, Mutation: {} }
  );
}

const server = new ApolloServer({
  typeDefs: fs.readFileSync(path.resolve(__dirname, "schema.graphql"), "utf8"),
  resolvers: resolversForAbstractClient(),
  context: ({ req }) => {
    const [_, accessToken = process.env.ABSTRACT_TOKEN] = (
      req.headers.authorization || ""
    ).split(" ", 2);

    return {
      abstract: accessToken
        ? Abstract.client({
            transport: Abstract.TRANSPORTS.API, // TODO: remove
            accessToken
          })
        : undefined
    };
  },
  engine: process.env.ENGINE_API_KEY && {
    apiKey: process.env.ENGINE_API_KEY
  }
});

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
