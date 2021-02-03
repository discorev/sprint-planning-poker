const AWS = require('aws-sdk');

const ddb = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const sns = new AWS.SNS({apiVersion: '2010-03-31', region: process.env.AWS_REGION });

exports.handler = async event => {
  console.log(event);
  const postData = JSON.parse(event.body);
  let connectionData;
  
  try {
    connectionData = await ddb.scan({
      TableName: process.env.TABLE_NAME,
      ProjectionExpression: 'connectionId, snoozed',
      FilterExpression: 'playerName = :n',
      ExpressionAttributeValues: {
        ':n': postData.player
      },
      ConsistentRead: true
    }).promise();
  } catch (err) {
    console.log('Could not find player', err);
    connectionData = {
      Count: 0
    }
  }

  if (connectionData.Count == 0) {
    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
      apiVersion: '2018-11-29',
      endpoint: event.requestContext.domainName + '/' + event.requestContext.stage
    });
    
    await apigwManagementApi.postToConnection({
      ConnectionId: event.requestContext.connectionId,
      Data: '{"action": "snooze","error": "Player not found"}'
    }).promise();
    return { statusCode: 404, body: 'Player not found' }
  }

  const playerData = connectionData.Items[0];
  console.log(playerData);

  playerData.snoozed = !playerData.snoozed;

  await ddb.update({
    TableName: process.env.TABLE_NAME,
    Key: {
      connectionId: playerData.connectionId
    },
    UpdateExpression: 'set snoozed = :sn',
    ExpressionAttributeValues: {
      ':sn': playerData.snoozed
    }
  }).promise();

  await sns.publish({
    TopicArn: process.env.NOTIFY_TOPIC,
    Message: 'SNOOZED',
    MessageAttributes: {
      api: {
        DataType: 'String',
        StringValue: event.requestContext.domainName + '/' + event.requestContext.stage
      },
      update: {
        DataType: 'String',
        StringValue: JSON.stringify({
          action: 'snooze',
          player: postData.player,
          snoozed: playerData.snoozed
        })
      }
    }
  }).promise();
  
  return { statusCode: 200, body: 'Snoozed player ' + postData.player };
};