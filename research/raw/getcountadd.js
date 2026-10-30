//ajax获取数量

//getCount.js    getSolrCount(id,query,text,type)  控件的ID，栏目或者年份参数，查询框输入的参数，查询的类型
	//1代表主题 ，0代表年份    ,2  代表机构
function getSolrCount(id,query,text,type)
{
	if(type == 0)
		query = "publishDateStr:*"+query+"*";
	else if(type == 1)
		query = "myChannelTitle:*"+query+"*";
	else if(type == 2)
		query = "ztChannelTitle:*"+query+"*";	
		
	var test = getFq(type);
	if(test != "")
		query = query+" AND "+test;

	query=encodeURI(encodeURI(query));
	$.ajax({
		url:"/search/query/getCount.jsp?query="+query+"&text="+text+"&type="+type,
		type:"get",
		success:function(data){
			//document.write(data);
			$("#"+id).html("("+$.trim(data)+")");
		},
		error:function(data){
			$("#"+id).html("(0)");
		}
	});
}

function getFq(type){
	
	//console.log("type:"+type);
	
	var channelResult = [];
	var objchannel = document.getElementsByName("channelBox");
	for(k in objchannel){
		if(objchannel[k].checked){
			channelResult.push("myChannelTitle:*"+objchannel[k].value+"*");
		}
	}	
	
	var ztchannelResult = [];
	var ztobjchannel = document.getElementsByName("ztchannelBox");
	for(k in ztobjchannel){
		if(ztobjchannel[k].checked){
			ztchannelResult.push("ztChannelTitle:*"+ztobjchannel[k].value+"*");
		}
	}
	
	
	var yearResult = [];
	var objyear = document.getElementsByName("yearBox");
	for(g in objyear){
		if(objyear[g].checked)
		{
			yearResult.push("publishDateStr:*"+objyear[g].value+"*");
		}
	}
	
	
	var my = "";
	var zt = "";
	var year = "";
	
	

	
	
	
	if(channelResult.length>0)
	{
		my += "(";
		for(var i=0;i<channelResult.length;i++)
		{
			my += channelResult[i]+" OR ";
		}
		my = my.substring(0,my.length-4);
		my += ")";
	}
	if(ztchannelResult.length>0)
	{
		zt += "(";
		for(var i=0;i<ztchannelResult.length;i++)
		{
			zt += ztchannelResult[i]+" OR ";
		}
		zt = zt.substring(0,zt.length-4);
		zt += ")";
	}
	if(yearResult.length>0)
	{
		year += "(";
		for(var i=0;i<yearResult.length;i++)
		{
			year += yearResult[i]+" OR ";
		}
		year = year.substring(0,year.length-4);
		year += ")";
	}
	
	if(type == 0)   //年份
	{
		if(my == "")
		{
			if(zt == "")
			{
				return "";
			}
			else
				return zt;
		}
		else
		{
			if(zt == "")
			{
				return my;
			}
			else
				return my+" AND "+zt;
		}
	}
	else if(type == 1)   //按主题
	{
		if(year == "")
		{
			if(zt == "")
			{
				return "";
			}
			else
				return zt;
		}
		else
		{
			if(zt == "")
			{
				return year;
			}
			else
				return year+" AND "+zt;
		}
	}
	else if(type == 2) //按提供单位
	{
		if(year == "")
		{
			if(my == "")
			{
				return "";
			}
			else
				return my;
		}
		else
		{
			if(my == "")
			{
				return year;
			}
			else
				return year+" AND "+my;
		}
	}
	

}


function Nav(id){
	var oNav = $(id);
	var aLi = oNav.find('li');
	
	aLi.hover(function (){
        $(this).addClass('on');
	},function (){
        $(this).removeClass('on');
	})	
};
