const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const sns = new AWS.SNS({apiVersion: '2010-03-31', region: process.env.AWS_REGION });

exports.handler = async event => {
  try {
    const connectionData = await ddb.get({
      TableName: process.env.TABLE_NAME,
      Key: {
        connectionId: event.requestContext.connectionId
      }
    }).promise();
    
    await ddb.delete({
      TableName: process.env.TABLE_NAME,
      Key: {
        connectionId: event.requestContext.connectionId
      }
    }).promise();

    if (connectionData.Item.playerName) {
      await ddb.delete({
        TableName: process.env.TABLE_NAME,
        Key: {
          connectionId: 'playerName#' + connectionData.Item.playerName
        }
      }).promise();

      // Post a register message to SNS to send out an updated player list
      await sns.publish({
        TopicArn: process.env.NOTIFY_TOPIC,
        Message: 'REGISTER',
        MessageAttributes: {
          api: {
            DataType: 'String',
            StringValue: event.requestContext.domainName + '/' + event.requestContext.stage
          }
        }
      }).promise();
    }

  } catch (err) {
    return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(err) };
  }
  
  return { statusCode: 200, body: 'Disconnected.' };
};