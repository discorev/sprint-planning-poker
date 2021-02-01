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
      ProjectionExpression: 'connectionId,playerName,choice,snoozed',
      FilterExpression: 'attribute_exists(playerName)'
    }).promise();
  } catch (err) {
    console.log('Could not find player', err);
    throw(err);
  }
  
  // If every item has a choice that's not null then return
  if (connectionData.Items.every(record => record.choice !== null)) {
    return;
  }
  
  // Find the current player's information
  const currentPlayer = connectionData.Items.find(
    record => record.connectionId === event.requestContext.connectionId
    );
    
    // Update the players choice in the database
    const result = await ddb.update({
      TableName: process.env.TABLE_NAME,
      Key: {
        connectionId: event.requestContext.connectionId
      },
      UpdateExpression: 'set snoozed = :sn, choice = :ch',
      ExpressionAttributeValues: {
        ':sn': false,
        ':ch': postData.choice
      }
    }).promise();
    
    console.log(result);
    
    // This needs to be sent to all players
    let playerChoice = JSON.stringify({
      name: currentPlayer.playerName,
      selected: (postData.choice != null)
    });
    
    await sns.publish({
      TopicArn: process.env.NOTIFY_TOPIC,
      Message: 'SELECTED',
      MessageAttributes: {
        api: {
          DataType: 'String',
          StringValue: event.requestContext.domainName + '/' + event.requestContext.stage
        },
        update: {
          DataType: 'String',
          StringValue: playerChoice
        }
      }
    }).promise();
    
    return { statusCode: 200, body: 'Player made a choice' };
  };