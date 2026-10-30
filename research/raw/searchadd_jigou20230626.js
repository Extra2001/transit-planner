Date.prototype.format = function (fmt) {
	var o = {
		"M+": this.getMonth() + 1,
		"d+": this.getDate(),
		"h+": this.getHours() % 12 == 0 ? 12 : this.getHours() % 12,
		"H+": this.getHours(),
		"m+": this.getMinutes(),
		"s+": this.getSeconds(),
		"q+": Math.floor((this.getMonth() + 3) / 3),
		"S": this.getMilliseconds()
	};
	var week = {
		"0": "/u65e5",
		"1": "/u4e00",
		"2": "/u4e8c",
		"3": "/u4e09",
		"4": "/u56db",
		"5": "/u4e94",
		"6": "/u516d"
	};
	if (/(y+)/.test(fmt)) {
		fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length))
	}
	if (/(E+)/.test(fmt)) {
		fmt = fmt.replace(RegExp.$1, ((RegExp.$1.length > 1) ? (RegExp.$1.length > 2 ? "/u661f/u671f" : "/u5468") : "") + week[this.getDay() + ""])
	}
	for (var k in o) {
		if (new RegExp("(" + k + ")").test(fmt)) {
			fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)))
		}
	}
	return fmt
}
var Search = {};
Search.pageSize = 5;
Search.pageIndex = 1;
Search.pageQuery = '';
Search.pageStart = 0;
// Search.CMSURL="/cms/web/search";
Search.CMSURL = "https://data.beijing.gov.cn/cms/web/search";

//added by xum 20181113
Search.searchCondition = '';
Search.ztChannelTitle = '';
//added by xum 20190418
Search.keyname = '';






// 获取地址栏带的搜索标题
//jquery提供的完整方法
$(document).ready(function () {
	a = decodeURI(window.location.search);
	a = a.substr(1)
	e = a.substring(a.indexOf('type=') + 5, a.indexOf('&'))
	e = e.substring(2);

	var keynames = ''
	keynames = e
	if (keynames != null && keynames != '') {
		$('.keytitle #keywords').val(keynames)
	} else {
		$('.keytitle #keywords').val('')
	}


	$('.keycon .keytitle .down').click(function () {
		var params2 = {
			'orderFiled': '',
			'orderMethod': '',
			'pageSize': Search.pageSize,
			'curPage': Search.pageIndex,
			'subject': '',
			'typeName': '',
			'name': '',
			'department': ''
		};

		if (Search.sortN) {
			params2.orderFiled = Search.sortN;
		} else {
			params2.orderFiled = "publishDate";
		}
		if (Search.sortM) {
			params2.orderMethod = Search.sortM;
		} else {
			params2.orderMethod = "desc";
		}
		params2.pageSize = Search.pageSize;
		params2.curPage = Search.pageIndex;
		params2.subject = $('.topic li a.active').text() == '全部' ? '' : $('.topic li a.active').text();
		// params2.typeName = $('.formal li a.active').text() == '全部' ? '' : $('.formal li a.active').text();
		params2.typeName = "";
		params2.name = $('.keytitle #keywords').val();


		$(".f_xinjiaList").find("li").each(function () {
			if ($(this).hasClass('current')) {
				params2.department = $(this).find('a').text()
			}
		});

		var flag = false
		var paramsstr = ''
		for (prop in getParams(params2)) {
			paramsstr += "&" + prop + "=" + getParams(params2)[prop]
		}


		$.ajax({
			type: "POST",
			url: "https://data.beijing.gov.cn/cms/web/bjdata/inLogin.jsp",
			async: false,
			success: function (response) {
				if (response.code == '404') {
					var choose = confirm("您好，数据及接口下载使用需登录本网站，欢迎您注册登录。");
					if (choose == true) {
						location.href = 'https://data.beijing.gov.cn/cms/web/bjdata/sso/ssoLogin.jsp';
						flag = false
					} else {
						flag = false
					}
				} else {
					$('.keycon .keytitle .down').attr('href', 'https://data.beijing.gov.cn/cms/web/search/downloadDataList?' + paramsstr)
					flag = true
				}
			}
		})
		return flag;
	})

	//  
	$('.tips1 a').click(function () {
		var params3 = {
			'orderFiled': '',
			'orderMethod': '',
			'pageSize': 100000,
			'curPage': 1,
			'subject': '',
			'typeName': '',
			'name': '',
			'department': ''
		};
 

		var flag = false
		var paramsstr3 = ''
		for (prop in getParams(params3)) {
			paramsstr3 += "&" + prop + "=" + getParams(params3)[prop]
		}


		$.ajax({
			type: "POST",
			url: "https://data.beijing.gov.cn/cms/web/bjdata/inLogin.jsp",
			async: false,
			success: function (response) {
				if (response.code == '404') {
					var choose = confirm("您好，数据及接口下载使用需登录本网站，欢迎您注册登录。");
					if (choose == true) {
						location.href = 'https://data.beijing.gov.cn/cms/web/bjdata/sso/ssoLogin.jsp';
						flag = false
					} else {
						flag = false
					}
				} else {
					$('.tips1 a').attr('href', 'https://data.beijing.gov.cn/cms/web/search/downloadDataList?' + paramsstr3)
					flag = true
				}
			}
		})
		return flag;
	})

	$('.keytitle .notxt1').click(function () {
		Search.search();
	})

});



Search.getSites = function () {
	var index_ID;
	try {
		index_ID = document.getElementById("index_ID").value;
	} catch (e) {

	}
	var isDynamic = false;
	//var isInvalid = false;
	var list;
	$.ajax({
		url: 'sites.jsp',
		dataType: 'json',
		type: 'post',
		async: false,
		success: function (data) {
			if (data) {
				//热搜词
				Search.listWords = data.listWords;
				Search.initHotWords();
				list = data.listSites;
				var myPort = window.location.href;
				//console.log(myPort);
				myPort = myPort.substring(myPort.indexOf('//') + 2)
				if (myPort.indexOf("/") != -1) {
					myPort = myPort.substring(0, myPort.indexOf('/'))
				}
				if (myPort.indexOf(":") != -1) {
					myPort = myPort.substring(myPort.indexOf(':') + 1)
				} else {
					myPort = 80;
				}
				//console.log(myPort);
				var hostTemp = '127.0.0.1:' + myPort + '/search/';
				var shareCore = '';
				var shards_ID = '';
				var str = '';
				if (index_ID) {
					isDynamic = true;
					if (index_ID == -1) {
						//str='<option value="-1">全站搜索</option>';
						for (var i = 0; i < list.length; i++) {
							//str += '<option value="'+list[i].ID2+'" data-value="'+list[i].ID+'">'+list[i].name+'</option>';
							if (i == 0) {
								shards_ID = list[i].ID;
							} else {
								shareCore += ',' + hostTemp + list[i].ID;
							}
						}
						$("#indexID").val(-1);
					} else {
						var index_IDs = index_ID.split(',');
						if (index_IDs.length == 1) {
							//单个栏目时
							for (var i = 0; i < list.length; i++) {
								if (index_ID == list[i].ID2) {
									//str += '<option value="'+list[i].ID2+'" data-value="'+list[i].ID+'">'+list[i].name+'</option>';
									$("#indexID").val(list[i].ID);
								}
							}
						} else {
							//多个栏目
							var indexCount = 0;
							for (var i = 0; i < list.length; i++) {
								for (var j = 0; j < index_IDs.length; j++) {

									if (index_IDs[j] == list[i].ID2) {
										if (indexCount == 0) {
											//str += '<option value="'+list[i].ID2+'" data-value="'+list[i].ID+'">'+list[i].name+'</option>';
											//$("#indexID").val(list[i].ID);
											$("#indexID").val(-1);
											shards_ID = list[i].ID;
										} else {
											shareCore += ',' + hostTemp + list[i].ID;
										}
										indexCount++;
									}
								}
							}
						}
					}
				} else {
					//not dynamic
					str = '<option value="-1" >全站搜索</option>';
					for (var i = 0; i < list.length; i++) {
						str += '<option value="' + list[i].ID2 + '" data-value="' + list[i].ID + '">' + list[i].name + '</option>';
						//shareCore+=','+hostTemp+list[i].ID;
						if (i == 0) {
							shards_ID = list[i].ID;
						} else {
							shareCore += ',' + hostTemp + list[i].ID;
						}
					}
				}
				//console.log(shareCore);
				if (shareCore && shards_ID) {
					shareCore = shareCore.substring(1);
					Search.shards = shareCore;
					Search.shards_ID = shards_ID;
				}
				if (isDynamic) {} else {
					$('#indexID').html(str);
				}
			} else {
				//console.log(data);
				alert("检索服务尚未完全启动或已停止！")
			}

		},
		error: function (err) {
			//console.log(err);
		},
		complete: function () {
			if (isDynamic) {
				//(index*Search.pageSize);
				Search.pageIndex = 1;
				Search.pageStart = Search.pageSize * (Search.pageIndex - 1);
				Search.pageQuery = $("#query").val();
				Search.query(true);
			} else {
				//进入页面时初始化默认选项
				var myindex = Search.requestParamName('index');
				if (myindex) {
					for (var i = 0; i < list.length; i++) {
						if (list[i].ID2 == myindex) {
							$('#indexID').val(myindex);
							break;
						}
					}
				}
			}
		}
	});
};
Search.requestParamName = function (name) {
	var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
	var r = window.location.search.substr(1).match(reg);
	if (r != null) return unescape(r[2]);
	return null;
}


//每页显示
Search.searchPage = function (pageSize) {
	Search.pageSize = pageSize;
	Search.search();
}



Search.searchSort = function (index) {
	if (index == 0) { //默认排序
		Search.sortN = "";
		Search.sortM = "desc";
	} else if (index == 1) { //时间排序
		Search.sortN = "publishDate";
		Search.sortM = "desc";
	} else if (index == 2) { //按主题
		Search.sortN = "subject";
		Search.sortM = "desc";
	} else if (index == 3) { //按机构
		Search.sortN = "department";
		Search.sortM = "desc";
	} else if (index == 4) { //按下载量
		Search.sortN = "downloadCount";
		Search.sortM = "desc";
	}
	Search.search();
}
//升序or降序
Search.searchSortM = function (index) {
	if (index == 0) { //升序
		Search.sortM = 'asc';
	} else if (index == 1) { //降序
		Search.sortM = 'desc';
	}
	Search.search();
}
Search.timestampToTime = function (timestamp) {
	var date = new Date(parseInt(timestamp));
	var Y = date.getFullYear() + '-';
	var M = (date.getMonth() + 1 < 10 ? '0' + (date.getMonth() + 1) : date.getMonth() + 1) + '-';
	var D = (date.getDate() < 10 ? '0' + date.getDate() : date.getDate()) + ' ';
	// h = (date.getHours()<10?'0'+date.getHours():date.getHours()) + ':';
	// m = date.getMinutes()<10?'0'+date.getMinutes():date.getMinutes();
	// s = ':'+date.getSeconds();
	return Y + M + D;
}
Search.search = function (index) {
	if (index) {} else {
		index = 1;
		Search.pageQuery = $("#query").val();
	}
	Search.pageIndex = index; //(index*Search.pageSize);
	Search.pageStart = Search.pageSize * (Search.pageIndex - 1);
	Search.query();
};
Search.query = function () {
	var query = Search.pageQuery;
	if (!query) {
		query = "";
	}
	try {
		query = $.trim(query);
	} catch (e) {

	}
	var len;
	if (/[\u4e00-\u9fa5]+/g.test(query)) {
		len = query.length;
		if (query.length > 38) {
			alert("含中文关键词长度不超过38个！从此处截取:" + query.charAt(37) + query.charAt(38));
			query = query.substring(0, 38);
		}
	} else {
		len = query.length / 2;
		if (query.length > 76) {
			alert("全英文关键词长度不超过76个！从此处截取:" + (query.charAt(70) + query.charAt(71) +
				query.charAt(72) + query.charAt(73) + query.charAt(74) + query.charAt(75) + query.charAt(76)));
			query = query.substring(0, 76);
		}
	}
	query = query.replace(/ /g, "+"); //输入框查询的值



	// var indexID=$("#indexID").val();    //select下拉框的值
	// var cds = $("#indexID").children();  //获取select下拉框的所有子元素
	// var self,ID2;   //ID2 获取下拉框的 data-value的值，例如 1_http
	// for(var i=0;i<cds.length;i++){
	// 	self = $(cds[i]);
	// 	if(self.is(":checked")){
	// 		ID2 = self.attr('data-value');
	// 		break;
	// 	}
	// }
	// if(indexID!=-1){
	// 	if(indexID.indexOf('_')!=-1){
	// 		ID2 = indexID;
	// 	}
	// 	if(!ID2){
	// 		//$("#indexID").foucs();;
	// 		// alert("站点选择无效，请重新选择！");
	// 		return ;
	// 	}
	// }else{
	// 	ID2 = Search.shards_ID;
	// }



	Search.rtShow(true); //显示查询的html  
	// Search.blockUI(".rf");

	//add by zt 如果仅仅有一个索引的时候默认为第一个
	// if(ID2 == undefined)
	// 	ID2 = "1_file";



	// if(ID2){
	$("#htmlContentTemplate").html('正在初始化搜索引擎，可能需要点时间（约一分钟）！');


	// var pubHost,pubPath;
	// if(ID2.indexOf('file')!=-1){
	// 	var ID4 = ID2.substring(0,(ID2.indexOf('_')));
	// 	$.ajax({//路径获取
	// 		url:'SearchWordsServlet',data:{cmd:'getPublishPath',ID:ID4},dataType:'json',type:'get',async:false,
	// 		success:function(data){
	// 			//console.log(data);
	// 			pubHost = data.data.pubHost;
	// 			pubPath = data.data.pubPath;
	// 			if(pubPath){

	// 				pubPath = pubPath.substring(2);
	// 				pubPath = Base64.decode(pubPath);
	// 				pubPath = pubPath.substring(3);
	// 				pubPath = Base64.decode(pubPath);
	// 				pubPath = pubPath.replace(/\\/g, '/');
	// 				pubPath = pubPath.replace(/\\/g, '/');
	// 			}
	// 		}
	// 	});
	// }

	var getExSummary = function (doc) {
		if (doc) {
			if (doc.source && doc.source != "西城区" && doc.source != "东城区" && doc.source != "朝阳区" && doc.source != "海淀区" && doc.source != "丰台区" && doc.source != "石景山区" && doc.source != "通州区" && doc.source != "昌平区" &&
				doc.source != "门头沟区" && doc.source != "大兴区" && doc.source != "顺义区" && doc.source != "房山区" && doc.source != "怀柔区" && doc.source != "平谷区" && doc.source != "密云区" && doc.source != "延庆区") {
				if (doc.publishDate >= 1635523200000 && doc.publishDate <= 1635609599000) {
					content = "该数据是" + doc.source + "提供的政务服务事项办事指南信息，包括所属区划、业务指导（实施）部门、实施主体、事项名称-主项、基本编码-主项等属性字段。";
					return content;
				}
			}
			return doc.summary;

		}
		return "";
	}

	var params = {};
	if (query) {
		params.columns = query;
	}
	params = getParams(params);

	var htmlString = '';
	var allWordIDs = '';

	var docsCount;

	$.ajax({
		url: Search.CMSURL,
		data: params,
		dataType: 'json',
		type: 'get',
		success: function (data) {
			var numFound = data.page.count;
			if (numFound > 0) {
				var qTime = data.object.took;
				var docs = data.object.docs;
				var doc;
				var size = 0;
				var title, content, indexUrl = "Javascript:void(0);",
					dateStr,
					score = 0,
					queryHtmlStr = '',
					uuid, pageStr = '',
					elevated = false,
					unitName, downloadCount, callCount, imgsrc, dataId;

				var template = '<li><div id="zhuti_img"><img src="{imgsrc}" width="48px"></div><div><h2 style="font-size: 22px;"><a data-id="{dataId}" href="{url}" target="_blank">{title}</a></h2><p style="font-size: 16px;">{content}</p><br><div class="bot"><h4 style="font-size: 14px;"><b>{unitName}</b>&nbsp;&nbsp;&nbsp;&nbsp;{pubDate}&nbsp;&nbsp;{downloadCount}&nbsp;&nbsp;{callCount}</h4><div class="operation"><a class="subscription toCollect" href="{url}" >订阅</a><a style="display:none;" class="collected subscription" href="{url}">已订阅</a><a class="error" href="{url}">纠错</a><a class="check" href="{url}">查看</a><a class="download" href="{url}">下载</a></div></div></div></li>' 
				var summary = '该数据是{department}提供的{name}，包含{columns}等属性字段。'
				docsCount = docs.length;
				for (var i = 0; i < docsCount; i++) {
					title = '';
					imgsrc = '';
					content = '';
					doc = docs[i];

					dataId = doc.id;
					indexUrl = doc.url;
					title = doc.name;
					imgsrc = doc.imgSrc;
					// 摘要展示，并高亮展示字段中的关键词
					content = summary.replace('{department}',doc.department)
						.replace('{name}',doc.name)
						.replace('{columns}',Search.highlightKeywords(doc.columns, params.columns));
					// content = getExSummary(doc);
					dateStr = Search.timestampToTime(doc.publishDate);
					unitName = doc.source;



					if (unitName != null && unitName.length > 0) {
						unitName = unitName + " 提供";
					} else {
						unitName = "";
					}


					downloadCount = doc.downloadCount;
					if (downloadCount != null && downloadCount >= 0) {
						downloadCount = "下载次数:" + downloadCount;
					} else {
						downloadCount = "";
					}


					callCount = doc.invokeCount;
					if (callCount != null && callCount >= 0) {
						callCount = "调用次数:" + callCount;
					} else {
						callCount = "";
					}

					queryHtmlStr += template.replace(/\{title}/g, title).replace(/\{pubDate}/g, dateStr + " 更新")
						.replace(/\{url}/g, indexUrl).replace(/\{size}/g, '').replace(/\{score}/g, "")
						.replace(/\{content}/g, content)
						.replace(/\{unitName}/g, unitName)
						.replace(/\{downloadCount}/g, downloadCount)
						.replace(/\{callCount}/g, callCount)
						.replace(/\{dataId}/g, dataId)
						.replace(/\{imgsrc}/g, imgsrc);
					//replace(/\{size}/g, size+'k') 
				}

				var pageNum = numFound / Search.pageSize;
				pageNum = parseInt(pageNum);
				if (numFound % Search.pageSize != 0) {
					pageNum++;
				}
				var prev = Search.pageIndex;
				var next = Search.pageIndex;
				pageStr += '<span class="rn">找到' + numFound + '项&nbsp;&nbsp;第' + Search.pageIndex + '页/共' + pageNum + '页 &nbsp;</span>';
				pageStr += '<a href="javascript:void(0);" onclick="Search.search(1);" class="pager num">首页</a>&nbsp;';
				if ((prev - 1) <= 0) {
					pageStr += '<span  class="pager">上一页</span>&nbsp;';
				} else {
					prev--;
					pageStr += '<a href="javascript:void(0);" onclick="Search.search(' + prev + ');" class="pager num">上一页</a>&nbsp;';
				}
				if (Search.isPC) {
					if (pageNum >= 10 && next > 5) {
						var pageArrs = new Array();
						for (var i = next - 5; i < next; i++) {
							pageArrs.push(i);
						}
						for (var i = next; i < next + 5 && i <= pageNum; i++) {
							pageArrs.push(i);
						}
						for (var i = 0; i < pageArrs.length; i++) {
							if (pageArrs[i] == Search.pageIndex) {
								pageStr += '<span class="pager">' + pageArrs[i] + '</span>&nbsp; ';
							} else {
								pageStr += '<a href="javascript:void(0);" onclick="Search.search(' + pageArrs[i] + ');" class="pager num">' + pageArrs[i] + '</a>&nbsp;';
							}
						}
					} else {
						for (var i = 1; i <= Math.min(pageNum, 10); i++) {
							if (i == Search.pageIndex) {
								pageStr += '<span class="pager">' + i + '</span>&nbsp; ';
							} else {
								pageStr += '<a href="javascript:void(0);" onclick="Search.search(' + i + ');" class="pager num">' + i + '</a>&nbsp;';
							}
						}
					}
				}
				if ((next + 1) > pageNum) {
					pageStr += '<span  class="pager">下一页</span>&nbsp;';
				} else {
					next++;
					pageStr += '<a href="javascript:void(0);" onclick="Search.search(' + next + ');" class="pager num">下一页</a>&nbsp;';
				}
				pageStr += '<a href="javascript:void(0);" onclick="Search.search(' + pageNum + ');" class="pager num">末页</a>';
 
				$(".keycon .tips1 p").html('共有<span>'+numFound+'</span>个数据目录（含往年开放数据）');
				$("#htmlContentTemplate").html(htmlString + queryHtmlStr);

				// $.each($('#htmlContentTemplate li'), function (i, n) {
				// 	var _that = $(this)
				// 	// $.get('js/a' + i + '.json?contentId=' + dataId, function (response) {
				// 	$.post('/cms/web/isCollect?contentId=' + dataId, function (response) {
				// 		if ('已收藏' === response.msg) {
				// 			_that.find('.toCollect').hide()
				// 			_that.find('.collected').show()
				// 		} else {
				// 			_that.find('.toCollect').show()
				// 			_that.find('.collected').hide()
				// 		}
				// 	});
				// })

				// $('#htmlContentTemplate').on('click', '.toCollect', function () {
				// 	$.ajax({
				// 		type: "POST",
				// 		url: "/cms/web/bjdata/inLogin.jsp",
				// 		async: false,
				// 		success: function (response) {
				// 			console.log(response);
				// 			if (response.code == '404') {
				// 				location.href = '/cms/web/bjdata/sso/ssoLogin.jsp';
				// 			} else {
				// 				$.ajax({
				// 					type: "get",
				// 					url: "/cms/data/collect/" + $(this).parents('.bot').prev().prev().prev().find('a').attr('data-id'),
				// 					async: false,
				// 					success: function (response) {
				// 						$(this).parents('.bot').find('.toCollect').hide()
				// 						$(this).parents('.bot').find('.collected').show()
				// 					}
				// 				});
				// 			}
				// 		}
				// 	});
				// })



				$(".page").html(pageStr);
				$('.rt_con01').html('【共有' + numFound + '项查询结果，这是第' + (Search.pageStart + 1) + '-' + (Search.pageStart + docs.length) + '项。 搜索用时' + qTime + '毫秒】');
			} else {
				if (htmlString) {
					$("#htmlContentTemplate").html(htmlString + queryHtmlStr);
				} else {
					var listWords = Search.listWords;
					var sug = '';
					if (listWords) {
						for (var i2 = 0; i2 < listWords.length && i2 < 20; i2++) {
							sug += listWords[i2].name + ' ';
						}
					}
					var noHtmlStr = '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr align="center">' +
						'<td height="38">对不起！没有发现您要找的内容：<span class="keyword">' + query +
						'</span></td></tr><tr align="center"><td height="38">您可以多词搜索 或 搜索一句话</td></tr>' +
						'</table>';
					$("#htmlContentTemplate").html(noHtmlStr);
					$(".page").html('');
					$('.rt_con01').html('【共有0项查询结果，这是第0-0项。 搜索用时0毫秒】');

				}
			}
			// Search.unblockUI(".rf");
			reloadJs(data.object.subjects, data.object.departments);

		},
		error: function (err) {
			//console.log(err);
			alert("服务器异常 或 网络异常！");
			// Search.unblockUI(".rf");
		},
		complete: function () {

			// $('.allword').hide();//去掉“全词匹配”字样
			// var myKeys = anString.split(' ');
			// $.each(myKeys,function(index,value){
			// 	if(/[a-zA-Z]/g.test(value)){
			// 		anString = anString.replace(value,'');
			// 		anString = anString.replace('  ',' ');
			// 	}
			// });

			// $(".keyword").html(anString);
			// if(len>1 && len<9 && anString.indexOf(query)==-1){ //加上本搜索词
			// 	anString = query+' '+anString
			// }else{
			// 	if(docsCount>0 && !anString){
			// 		//anString = query;
			// 	}
			// }
			// var searchWords = {
			// 		cmd:'add'
			// 		,searchWords:anString
			// 		//,indexCore:ID2
			// };
			// //console.log("ID2:",ID2);
			// $.ajax({
			// 	url:'SearchWordsServlet',data:searchWords,dataType:'json',type:'post',success:function(data){}
			// 	,error:function(err){
			// 		//console.log(err);
			// 	}
			// });
		}
	});
	// }



};
Search.round = function (digit, length) {
	length = length ? parseInt(length) : 0;
	if (length <= 0) return Math.round(digit);
	digit = Math.round(digit * Math.pow(10, length)) / Math.pow(10, length);
	return digit;
};
Search.blockUI = function (el) {
		var el = jQuery(el);
		el.block({
			message: '<img src="img/ajax-loading.gif" align="" title="正在加载中...">',
			centerY: true,
			css: {
				top: '10%',
				border: 'none',
				padding: '2px',
				backgroundColor: 'none'
			},
			overlayCSS: {
				backgroundColor: '#000',
				opacity: 0.05,
				cursor: 'wait'
			}
		});
	},
	// wrapper function to  un-block element(finish loading)
	Search.unblockUI = function (el) {
		jQuery(el).unblock({
			onUnblock: function () {
				jQuery(el).removeAttr("style");
			}
		});
	}

function IsPC() {
	var userAgentInfo = navigator.userAgent;
	var Agents = ["Android", "iPhone",
		"SymbianOS", "Windows Phone",
		"iPad", "iPod"
	];
	var flag = true;
	for (var v = 0; v < Agents.length; v++) {
		if (userAgentInfo.indexOf(Agents[v]) > 0) {
			flag = false;
			break;
		}
	}
	return flag;
}

//这个热搜词 是仅仅显示添加的
Search.initHotWords = function () {
	var listWords = Search.listWords;

	var wordName;
	var count = 1;
	var liStr = '<ul><h2>热搜词</h2>';
	if (listWords) {
		for (var i = 0; i < listWords.length; i++) {
			wordName = listWords[i].name;
			if (listWords[i].type == 1) {
				liStr += '<li><a href="javascript:void(0);" onclick="Search.linkQuery(this);">' + wordName + '</a></li>';
				if (count > 10) {
					break;
				}
				count++;
			}
		}
	}
	//liStr += '<li><a href="">中国科学家协会与发展公共事业的关系</a></li>';
	liStr += '</ul>';
	//console.log(liStr);
	$(".keycon_tro_rt").html(liStr);
}
Search.linkQuery = function (self) {
	//console.log(self,self.innerHTML);
	$("#query").val(self.innerHTML);
	Search.pageQuery = self.innerHTML;
	//	Search.search(1);
	Search.pageIndex = 1; //(index*Search.pageSize);
	Search.pageStart = Search.pageSize * (Search.pageIndex - 1);
	Search.query(true);
}
Search.rtShow = function (cmd) {
	if (Search.fristSearch) {
		if (cmd) {
			Search.fristSearch = false;
			$(".rtShow").show();
			$(".rtWaitting").hide();
			$(".ser").css({
				'margin-top': '0px',
				'padding': ' 0px 1%'
			});
			$(".wrap_con02").css('height', '72px');

			//add by zt
			$("#channelSort").show();
			//$("#yearSort").show();

		} else {
			$(".rtShow").hide();
			$(".rtWaitting").show();
			//$(".wrap_con02").css('height','500px');
			$(".ser").css({
				'margin-top': '16%',
				'padding': ' 7% 1%'
			});

			//add by zt
			$("#channelSort").hide();
			//$("#yearSort").hide();
		}
	}
}
/**
 * Created by sunJia on 2025/07/21.
 * @Description - 搜索结果高亮
 * @param - {text: 搜索结果, keywords: 关键词} 
 * @return - 高亮后的结果
 */
Search.highlightKeywords = function (text, keywords) {
	var reg = new RegExp(keywords, "gi");
	return text.replace(reg, function (match) {
		return "<span class='highlight'>" + match + "</span>";
	});
}





$(function () {
	Search.fristSearch = true;
	Search.rtShow(false);
	Search.isPC = IsPC();
	$("#query").focus();
	// Search.getSites();


	//处理 keydown 和 keyup的冲突
	Search.sbm = true;
	//keypress 
	$(document).keyup(function (e) {
		if (e.which == 13) {
			if (Search.sbm) {
				Search.search();
			} else {
				Search.sbm = true;
			}
		}
	});
	$('#lbx').mouseleave(function (e) {
		$('#append').hide().html("");
	});
	$('#query').dblclick(function (e) {
		$('#append').hide().html("");
	});
	$(document).keydown(function (e) {
		e = e || window.event;
		var keycode = e.which ? e.which : e.keyCode;
		if (keycode == 38) {
			if (jQuery.trim($("#append").html()) == "") {
				return;
			}
			movePrev();
			Search.sbm = false; //只是选择不提交
		} else if (keycode == 40) {
			if (jQuery.trim($("#append").html()) == "") {
				return;
			}
			$("#query").blur();
			if ($(".item").hasClass("addbg")) {
				moveNext();
			} else {
				$(".item").removeClass('addbg').eq(0).addClass('addbg');
			}
			Search.sbm = false; //只是选择不提交
		} else if (keycode == 13) {
			dojob();
		}
	});
	var movePrev = function () {
		$("#query").blur();
		var index = $(".addbg").prevAll().length;
		if (index == 0) {
			$(".item").removeClass('addbg').eq($(".item").length - 1)
				.addClass('addbg');
		} else {
			$(".item").removeClass('addbg').eq(index - 1).addClass('addbg');
		}
	}
	var moveNext = function () {
		var index = $(".addbg").prevAll().length;
		if (index == $(".item").length - 1) {
			$(".item").removeClass('addbg').eq(0).addClass('addbg');
		} else {
			$(".item").removeClass('addbg').eq(index + 1).addClass('addbg');
		}
	}
	var dojob = function () {
		$("#query").blur();
		var value = $(".addbg").text();
		if (value) {
			$("#query").val(value);
		}
		$("#append").hide().html("");

	}
	light();



	Search.sortN = "publishDate";
	Search.sortM = "desc";
	Search.initSearchByCondition();

	Search.query(true);
});


function getContent(obj) {

	//console.log(obj);

	var kw = jQuery.trim($(obj).val());
	if (kw == "") {
		$("#append").hide().html("");
		return false;
	}
	var html = "";
	var data = Search.listWords;
	if (data) {
		for (var i = 0; i < data.length; i++) {
			if (data[i].name.indexOf(kw) >= 0 || data[i].pinyin.indexOf(kw) >= 0) {
				html = html +
					"<div class='item' onmouseenter='getFocus(this)' onClick='getCon(this);'>" +
					data[i].name.replace(kw, '<span class="b">' + kw + '</span>') + "</div>"
			}
		}
	}
	if (html != "") {
		$("#append").show().html(html);
	} else {
		$("#append").hide().html("");
	}
}

function getFocus(obj) {
	$(".item").removeClass("addbg");
	$(obj).addClass("addbg");
}

function getCon(obj) {
	var value = $(obj).text();
	$("#query").val(value);
	$("#append").hide().html("");
}

function initImgs() {
	var rd = Math.random();
	$('#w_pre').attr('src', 'images/w_pre.png?t=' + rd);
	$('#w_next').attr('src', 'images/w_next.png?t=' + rd);
}

function light() {
	$.each($('.keytitle span'), function () {
		$(this).find('a').eq(0).addClass('active')
	})
	$('.topic a').eq(0).removeClass('active')
	$('.formal a').eq(0).removeClass('active')
	// $('.keytitle span a').eq(0).addClass('active');
	$('.keytitle').find('a').click(function () { 
		if($(this).parents('.keytitle').index() == 3){
			
		}else{
			if ($(this).attr('data-type') == 'imgs_1') {
				initImgs();
				$(this).children().eq(0).attr('src', 'images/pre.png?t=' + Math.random());
			} else if ($(this).attr('data-type') == 'imgs_2') {
				initImgs();
				$(this).children().eq(0).attr('src', 'images/next.png?t=' + Math.random());
			} else {
				if ($(this).parents('li').length > 0) {
					$(this).addClass('active').parents('li').siblings('li').children('a').removeClass('active')
					Search.search();
				}
				$(this).addClass('active').siblings().removeClass('active')
			}
		}
		
	});
}




function jigouCount(id, query, dataArray, type) {
	try {
		if (type == 1) {
			for (let i = 0; i < dataArray.length; i++) {
				if (dataArray[i].id == id) {
					return dataArray[i].count;
				}
			}
		} else if (type == 2) {
			for (let i = 0; i < dataArray.length; i++) {
				if (dataArray[i].id == id) {
					return dataArray[i].count;
				}
			}
		}
	} catch (e) {
		return 0;
	}
	return 0;
}

function setJigouCount(id, query, dataArray, type) {
	$("#" + id).html("(" + jigouCount(id, query, dataArray, type) + ")");
}

function reloadJs(subjects, departments) {
	//getCount.js    setJigouCount(id,query,jigouData,type)  控件的ID，栏目或者年份参数，查询框输入的参数，查询的类型
	//1代表主题，2代表机构，0代表年
	setJigouCount("市编办", "市编办", departments, 1);
	//setJigouCount("首都文明办","首都文明办",jigouData,1);	
	setJigouCount("市发展改革委", "市发展改革委", departments, 1);
	setJigouCount("市教委", "市教委", departments, 1);
	setJigouCount("市科委、中关村管委会", "市科委、中关村管委会", departments, 1);
	setJigouCount("副中心管委会", "副中心管委会", departments, 1);
	setJigouCount("市经济和信息化局", "市经济和信息化局", departments, 1);
	setJigouCount("市民族宗教委", "市民族宗教委", departments, 1);
	setJigouCount("市公安局", "市公安局", departments, 1);
	setJigouCount("市民政局", "市民政局", departments, 1);
	setJigouCount("市司法局", "市司法局", departments, 1);
	setJigouCount("北京邮管局", "北京邮管局", departments, 1);
	setJigouCount("市财政局", "市财政局", departments, 1);
	setJigouCount("市人力资源社会保障局", "市人力资源社会保障局", departments, 1);
	setJigouCount("市规划自然资源委", "市规划自然资源委", departments, 1);
	setJigouCount("市生态环境局", "市生态环境局", departments, 1);
	setJigouCount("市住房城乡建设委", "市住房城乡建设委", departments, 1);
	setJigouCount("中华人民共和国北京海关", "中华人民共和国北京海关", departments, 1);
	setJigouCount("临空区（大兴）管委会", "临空区（大兴）管委会", departments, 1);
	setJigouCount("市城市管理委", "市城市管理委", departments, 1);
	setJigouCount("市交通委", "市交通委", departments, 1);
	setJigouCount("市水务局", "市水务局", departments, 1);
	setJigouCount("市农业农村局", "市农业农村局", departments, 1);
	setJigouCount("市商务局", "市商务局", departments, 1);
	setJigouCount("市西站地区管理委员会", "市西站地区管理委员会", departments, 1);
	setJigouCount("市文化和旅游局", "市文化和旅游局", departments, 1);
	setJigouCount("北信基础设施公司", "北信基础设施公司", departments, 1);
	setJigouCount("市卫生健康委", "市卫生健康委", departments, 1);
	setJigouCount("市退役军人事务局", "市退役军人事务局", departments, 1);
	setJigouCount("市应急管理局", "市应急管理局", departments, 1);
	setJigouCount("市市场监督管理局", "市市场监督管理局", departments, 1);
	setJigouCount("市药监局", "市药监局", departments, 1);
	setJigouCount("市审计局", "市审计局", departments, 1);
	setJigouCount("市政府外办", "市政府外办", departments, 1);
	setJigouCount("市保密局", "市保密局", departments, 1);
	setJigouCount("国家税务总局北京市税务局", "国家税务总局北京市税务局", departments, 1);
	setJigouCount("市国资委", "市国资委", departments, 1);
	//setJigouCount("市社会办","市社会办",departments,1);	
	//setJigouCount("市文资办","市文资办",departments,1);	
	setJigouCount("市广播电视局", "市广播电视局", departments, 1);
	setJigouCount("市文物局", "市文物局", departments, 1);
	setJigouCount("市电影局", "市电影局", departments, 1);
	setJigouCount("市体育局", "市体育局", departments, 1);
	setJigouCount("市统计局", "市统计局", departments, 1);
	setJigouCount("市园林绿化局", "市园林绿化局", departments, 1);
	setJigouCount("市地方金融监管局", "市地方金融监管局", departments, 1);
	setJigouCount("市人防办", "市人防办", departments, 1);
        setJigouCount("市政务和数据局", "市政务和数据局", departments, 1);
	setJigouCount("市信访办", "市信访办", departments, 1);
	setJigouCount("市知识产权局", "市知识产权局", departments, 1);
	setJigouCount("市医保局", "市医保局", departments, 1);
	setJigouCount("市政府侨办", "市政府侨办", departments, 1);
	setJigouCount("市政务服务管理局", "市政务服务管理局", departments, 1);
	//setJigouCount("中关村管委会","中关村管委会",departments,1);	
	//setJigouCount("经济技术开发区管委会","经济技术开发区管委会",departments,1);	
	setJigouCount("天安门地区管委会", "天安门地区管委会", departments, 1);
	setJigouCount("市粮食物资局", "市粮食物资局", departments, 1);
	setJigouCount("市中医局", "市中医局", departments, 1);
	setJigouCount("市城管执法局", "市城管执法局", departments, 1);
	setJigouCount("市文化执法总队", "市文化执法总队", departments, 1);
	setJigouCount("市重大项目办", "市重大项目办", departments, 1);
	setJigouCount("市应急局", "市应急局", departments, 1);
	setJigouCount("市公园管理中心", "市公园管理中心", departments, 1);
	setJigouCount("市档案局", "市档案局", departments, 1);
	setJigouCount("市投资促进服务中心", "市投资促进服务中心", departments, 1);
	setJigouCount("住房公积金管理中心", "住房公积金管理中心", departments, 1);
	setJigouCount("市地方志编委会", "市地方志编委会", departments, 1);
	setJigouCount("市税务局", "市税务局", departments, 1);
	setJigouCount("市气象局", "市气象局", departments, 1);
	setJigouCount("市台办", "市台办", departments, 1);
	setJigouCount("北京海关", "北京海关", departments, 1);
	setJigouCount("市密码管理局", "市密码管理局", departments, 1);
	setJigouCount("市人民检察院", "市人民检察院", departments, 1);
	setJigouCount("市高级人民法院", "市高级人民法院", departments, 1);
	setJigouCount("市总工会", "市总工会", departments, 1);
	setJigouCount("市侨联", "市侨联", departments, 1);
	setJigouCount("团市委", "团市委", departments, 1);
	setJigouCount("市妇联", "市妇联", departments, 1);
	setJigouCount("市残联", "市残联", departments, 1);
	setJigouCount("市科协", "市科协", departments, 1);
	setJigouCount("市社科联", "市社科联", departments, 1);
	setJigouCount("市友协", "市友协", departments, 1);
	setJigouCount("北京医疗保险协会", "北京医疗保险协会", departments, 1);
	setJigouCount("市监狱管理局", "市监狱管理局", departments, 1);
	setJigouCount("市政务服务局", "市政务服务局", departments, 1);
	setJigouCount("中国证券监督管理委员会", "中国证券监督管理委员会", departments, 1);
	setJigouCount("中国银行保险监督管理委员会", "中国银行保险监督管理委员会", departments, 1);
	setJigouCount("中国人民银行营业管理部", "中国人民银行营业管理部", departments, 1);
	setJigouCount("市烟草专卖局", "市烟草专卖局", departments, 1);
	setJigouCount("市新闻出版局", "市新闻出版局", departments, 1);
	setJigouCount("市消防救援总队", "市消防救援总队", departments, 1);
	setJigouCount("市人才工作局", "市人才工作局", departments, 1);
	setJigouCount("市互联网信息办公室", "市互联网信息办公室", departments, 1);
	setJigouCount("市地震局", "市地震局", departments, 1);
	setJigouCount("市版权局", "市版权局", departments, 1);
	setJigouCount("国家外汇管理局北京外汇管理部", "国家外汇管理局北京外汇管理部", departments, 1);
	setJigouCount("北京市国家保密局", "北京市国家保密局", departments, 1);
	setJigouCount("北京市国家安全局", "北京市国家安全局", departments, 1);
	setJigouCount("市地方志办", "市地方志办", departments, 1);
	setJigouCount("北京信息基础设施建设股份有限公司", "北京信息基础设施建设股份有限公司", departments, 1);
	setJigouCount("市粮食和储备局", "市粮食和储备局", departments, 1);
	setJigouCount("市委编办", "市委编办", departments, 1);
	setJigouCount("市邮政管理局", "市邮政管理局", departments, 1);
	setJigouCount("市自来水集团", "市自来水集团", departments, 1);
	setJigouCount("重点站区管委会", "重点站区管委会", departments, 1);
	setJigouCount("市网信办", "市网信办", departments, 1);
	setJigouCount("中国证券监督管理委员会北京监管局", "中国证券监督管理委员会北京监管局", departments, 1);
	setJigouCount("中国银行保险监督管理委员会北京监管局", "中国银行保险监督管理委员会北京监管局", departments, 1);
	setJigouCount("中国国际贸易促进委员会北京市分会", "中国国际贸易促进委员会北京市分会", departments, 1);
	setJigouCount("北京市邮政管理局", "北京市邮政管理局", departments, 1);
	setJigouCount("北京市企业续贷受理中心", "北京市企业续贷受理中心", departments, 1);
	setJigouCount("市市场监管局", "市市场监管局", departments, 1);
	setJigouCount("市广电局", "市广电局", departments, 1);
	setJigouCount("市金融监管局", "市金融监管局", departments, 1);
	setJigouCount("市热力集团", "市热力集团", departments, 1);
	setJigouCount("东城区", "东城区", departments, 2);
	setJigouCount("西城区", "西城区", departments, 2);
	setJigouCount("朝阳区", "朝阳区", departments, 2);
	setJigouCount("海淀区", "海淀区", departments, 2);
	setJigouCount("丰台区", "丰台区", departments, 2);
	setJigouCount("石景山区", "石景山区", departments, 2);
	setJigouCount("门头沟区", "门头沟区", departments, 2);
	setJigouCount("房山区", "房山区", departments, 2);
	setJigouCount("通州区", "通州区", departments, 2);
	setJigouCount("顺义区", "顺义区", departments, 2);
	setJigouCount("昌平区", "昌平区", departments, 2);
	setJigouCount("大兴区", "大兴区", departments, 2);
	setJigouCount("怀柔区", "怀柔区", departments, 2);
	setJigouCount("平谷区", "平谷区", departments, 2);
	setJigouCount("密云区", "密云区", departments, 2);
	setJigouCount("延庆区", "延庆区", departments, 2);
	setJigouCount("经开区", "经开区", departments, 2);
}



function getParams(params) {
	if (!params) {
		params = {};
	}
	var channelResult = [];
	var objchannel = document.getElementsByName("channelBox");
	for (k in objchannel) {
		if (objchannel[k].checked) {
			channelResult.push(objchannel[k].value);
		}
	}

	var ztchannelResult = [];
	var ztobjchannel = document.getElementsByName("ztchannelBox");
	for (k in ztobjchannel) {
		if (ztobjchannel[k].checked) {
			ztchannelResult.push(ztobjchannel[k].value);
		}
	}


	var yearResult = [];
	var objyear = document.getElementsByName("yearBox");
	for (g in objyear) {
		if (objyear[g].checked) {
			yearResult.push(objyear[g].value);
		}
	}

	if (channelResult && channelResult.length > 0) {
		params.zhuti = channelResult.join(",");
	}
	if (ztchannelResult && ztchannelResult.length > 0) {
		params.danwei = ztchannelResult.join(",");
	}
	if (yearResult && yearResult.length > 0) {
		params.year = yearResult.join(",");
	}
	//以上参数可能没用到 
	if (Search.sortN) {
		params.orderFiled = Search.sortN;
	} else {
		params.orderFiled = "publishDate";
	}
	if (Search.sortM) {
		params.orderMethod = Search.sortM;
	} else {
		params.orderMethod = "desc";
	}
	params.pageSize = Search.pageSize;
	params.curPage = Search.pageIndex;
	params.subject = $('.topic li a.active').text() == '全部' ? '' : $('.topic li a.active').text();
	// params.typeName = $('.formal li a.active').text() == '全部' ? '' : $('.formal li a.active').text();
	params.typeName = "";
	params.columns = $('.keytitle #keywords').val();




	if (Search.areaName) {
		params.department = Search.areaName;
	}

	return params;
}

Search.initSearchByCondition = function () {
	var department = localStorage.getItem("department");
	localStorage.setItem("department", "");
	if (department) {
		Search.areaName = department;
		$('#city').css('display', 'block');
		$("#city").find("li").each(function () {
			var tdArr = $(this);
			var text = tdArr.find('div').find('a').text();
			if (text && text == Search.areaName) {
				tdArr.attr('class', 'current');
			} else {
				tdArr.attr('class', '');
			}
		});
		$('#area').css('display', 'block');
		$("#area").find("li").each(function () {
			var tdArr = $(this);
			var text = tdArr.find('div').find('a').text();
			if (text && text == Search.areaName) {
				tdArr.attr('class', 'current');
			} else {
				tdArr.attr('class', '');
			}
		});
	}
}

Search.searchByCondition = function (e) {
	if (!e) {
		return;
	}
	Search.areaName = e.target.innerText;
	if (!Search.areaName) {
		Search.areaName = '';
	}
	$('#city').css('display', 'block');
	$("#city").find("li").each(function () {
		var tdArr = $(this);
		var text = tdArr.find('div').find('a').text();
		if (text && text == Search.areaName) {
			tdArr.attr('class', 'current');
		} else {
			tdArr.attr('class', '');
		}
	});
	$('#area').css('display', 'block');
	$("#area").find("li").each(function () {
		var tdArr = $(this);
		var text = tdArr.find('div').find('a').text();
		if (text && text == Search.areaName) {
			tdArr.attr('class', 'current');
		} else {
			tdArr.attr('class', '');
		}
	});

	//added by xum 20190418
	if (Search.keyname && Search.keyname != Search.ztChannelTitle) {
		$("#" + Search.keyname).parentsUntil('div').siblings().css('color', '#333');
	}
	var web = window.location.href;
	//var pos=web.indexOf('/');
	var pos = web.lastIndexOf('?');
	test = web.substring(0, pos);
	//history.pushState("", "Title", test+"?"+"name="+Search.myChannelTitle);
	history.pushState("", "Title", test);
	Search.search();
};
