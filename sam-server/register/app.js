const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const sns = new AWS.SNS({apiVersion: '2010-03-31', region: process.env.AWS_REGION });

exports.handler = async event => {
  console.log(event);
  const postData = JSON.parse(event.body);

  try {
    await ddb.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: process.env.TABLE_NAME,
            Item: {
              connectionId: 'playerName#' + postData.name
            },
            ConditionExpression: 'attribute_not_exists(connectionId)'
          }
        },
        {
          Update: {
            TableName: process.env.TABLE_NAME,
            Key: {
              connectionId: event.requestContext.connectionId
            },
            UpdateExpression: 'set playerName = :n',
            ExpressionAttributeValues: {
              ':n': postData.name
            }
          }
        }
      ]
    }).promise();

    console.log('registered - sending message to SNS');

    await sns.publish({
      TopicArn: process.env.NOTIFY_TOPIC,
      Message: 'REGISTER',
      MessageAttributes: {
        api: {
          DataType: 'String',
          StringValue: event.requestContext.domainName + '/' + event.requestContext.stage
        },
        connectionId: {
          DataType: 'String',
          StringValue: event.requestContext.connectionId
        }
      }
    }).promise();

  } catch (err) {
    console.log('failed to register', err);
    
    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
      apiVersion: '2018-11-29',
      endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });
    
    await apigwManagementApi.postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: JSON.stringify({ error: JSON.stringify(err), message: 'Failed to register' })
    }).promise();

    return { statusCode: 500, body: 'Failed to register: ' + JSON.stringify(err) };
  }
  
  return { statusCode: 200, body: 'Registered.' };
};