const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

exports.handler = async event => {
    const postData = JSON.parse(event.body).data;
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
  } catch (err) {
    return { statusCode: 500, body: 'Failed to register: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'Registered.' };
};